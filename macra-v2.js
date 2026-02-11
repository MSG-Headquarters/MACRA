/**
 * MACRA v2.1 UNIFIED WORKOUT SYSTEM
 * ══════════════════════════════════════════════════════════════
 * 
 * This replaces the dual-system (localStorage + v2 API) with a 
 * single unified architecture ready for client-side encryption.
 * 
 * ARCHITECTURE:
 * ─────────────
 * User Input → Parse → [CRYPTO INTERCEPT POINT] → v2 API → Supabase
 *                           ↓
 *                    (v2.1: Encrypt with athlete code here)
 * 
 * KEY CHANGES FROM OLD SYSTEM:
 * 1. ALL workout/nutrition data flows through v2 API (no localStorage split)
 * 2. Crypto hooks ready for athlete-code encryption
 * 3. Unified session state management
 * 4. Fixed finalize button, add-set auto-populate, exercise data binding
 * 
 * BUGFIXES v2.1.2:
 * - FIX #1: finalizeWorkout now saves summary to appData.activities[dateKey]
 * - FIX #2: finalizeWorkout has timeout + error recovery to prevent ghost sessions
 * - FIX #3: renderWorkoutPanel renders inline-editable weight/reps fields
 * 
 * @version 2.1.2
 * @author MSG Headquarters / Aurelius Koda
 */

// ═══════════════════════════════════════════════════════════════
// CRYPTO LAYER (v2.1 READY - Currently passthrough)
// ═══════════════════════════════════════════════════════════════

const MacraCrypto = {
    /**
     * ENCRYPTION HOOK - Currently passthrough, v2.1 will encrypt here
     * @param {Object} data - Data to encrypt
     * @param {string} athleteCode - User's athlete code (e.g., MACRA-XXXX)
     * @returns {Object|string} - Encrypted payload (v2.1) or original data (v2.0)
     */
    encrypt(data, athleteCode = null) {
        // v2.0: Passthrough - data goes to API unencrypted
        // v2.1: Will derive key from athleteCode and encrypt
        if (typeof window.macraEncrypt === 'function' && athleteCode) {
            return window.macraEncrypt(data, athleteCode);
        }
        return data;
    },

    /**
     * DECRYPTION HOOK - Currently passthrough
     * @param {Object|string} payload - Encrypted payload
     * @param {string} athleteCode - User's athlete code
     * @returns {Object} - Decrypted data
     */
    decrypt(payload, athleteCode = null) {
        if (typeof window.macraDecrypt === 'function' && athleteCode) {
            return window.macraDecrypt(payload, athleteCode);
        }
        return payload;
    },

    /**
     * Check if encryption is available
     */
    isEnabled() {
        return typeof window.macraEncrypt === 'function';
    },

    /**
     * Get user's athlete code from auth state
     */
    getAthleteCode() {
        try {
            const auth = JSON.parse(localStorage.getItem('macra_auth') || '{}');
            return auth.athleteCode || null;
        } catch (e) {
            return null;
        }
    }
};

// ═══════════════════════════════════════════════════════════════
// UNIFIED STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

const UnifiedState = {
    // Active workout session (from v2 API)
    activeWorkout: null,
    
    // Today's nutrition (from v2 API)
    todayNutrition: null,
    
    // AI prediction for next exercise
    prediction: null,
    
    // Timer interval ID
    timerInterval: null,
    
    // Last known exercise for add-set auto-populate
    lastExercise: null,
    
    // Connection status
    isOnline: navigator.onLine,
    
    // Pending sync queue (for offline support)
    syncQueue: []
};

// ═══════════════════════════════════════════════════════════════
// API LAYER
// ═══════════════════════════════════════════════════════════════

async function unifiedApiCall(endpoint, options = {}) {
    const auth = JSON.parse(localStorage.getItem('macra_auth') || '{}');
    const token = auth.token;
    
    if (!token) {
        console.warn('No auth token available');
        return { ok: false, error: 'Not authenticated' };
    }
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
    
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: { ...headers, ...options.headers }
        });
        return response;
    } catch (error) {
        console.error('API Error:', error);
        // Queue for offline sync if needed
        if (!navigator.onLine && options.method !== 'GET') {
            UnifiedState.syncQueue.push({ endpoint, options, timestamp: Date.now() });
            showToast('📴 Saved offline - will sync when connected');
        }
        throw error;
    }
}

/**
 * API call with timeout to prevent hanging requests
 * @param {string} endpoint 
 * @param {Object} options 
 * @param {number} timeoutMs - Timeout in milliseconds (default 15s)
 */
async function unifiedApiCallWithTimeout(endpoint, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
        const response = await unifiedApiCall(endpoint, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.error(`API call to ${endpoint} timed out after ${timeoutMs}ms`);
            throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
        }
        throw error;
    }
}

// ═══════════════════════════════════════════════════════════════
// WORKOUT SESSION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get any active workout from the backend
 */
async function getActiveWorkout() {
    try {
        const res = await unifiedApiCall('/api/v2/workout/active');
        if (res.ok) {
            const data = await res.json();
            // Decrypt if encryption enabled
            UnifiedState.activeWorkout = MacraCrypto.decrypt(data.session, MacraCrypto.getAthleteCode());
            return UnifiedState.activeWorkout;
        }
    } catch (e) {
        console.error('Get active workout error:', e);
    }
    return null;
}

/**
 * Start a new workout session
 */
async function startWorkout(workoutName = null) {
    try {
        const payload = MacraCrypto.encrypt({ workout_name: workoutName }, MacraCrypto.getAthleteCode());
        
        const res = await unifiedApiCall('/api/v2/workout/start', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            const data = await res.json();
            UnifiedState.activeWorkout = MacraCrypto.decrypt(data.session, MacraCrypto.getAthleteCode());
            showToast('🏋️ Workout started!');
            startWorkoutTimer();
            renderWorkoutPanel();
            return UnifiedState.activeWorkout;
        } else {
            const err = await res.json();
            if (err.session_id) {
                // Already have active workout - load it
                return await getActiveWorkout();
            }
            throw new Error(err.error);
        }
    } catch (e) {
        console.error('Start workout error:', e);
        showToast('❌ Failed to start workout');
    }
    return null;
}

/**
 * Add exercise to the current workout
 * This is the UNIFIED entry point - replaces both old systems
 */
async function addExercise(exerciseName, weight, reps, sets = 1, rpe = null) {
    // Auto-start workout if not active
    if (!UnifiedState.activeWorkout) {
        await startWorkout();
    }
    
    if (!UnifiedState.activeWorkout) {
        showToast('❌ Could not start workout session');
        return null;
    }
    
    // Save for add-set auto-populate
    UnifiedState.lastExercise = { name: exerciseName, weight, reps, sets, rpe };
    
    try {
        const exerciseData = {
            session_id: UnifiedState.activeWorkout.id,
            exercise_name: exerciseName,
            original_input: `${exerciseName} ${weight}lbs ${sets}x${reps}`,
            weight: parseFloat(weight) || 0,
            reps: parseInt(reps) || 0,
            sets: parseInt(sets) || 1,
            rpe: rpe ? parseFloat(rpe) : null
        };
        
        const payload = MacraCrypto.encrypt(exerciseData, MacraCrypto.getAthleteCode());
        
        const res = await unifiedApiCall('/api/v2/workout/exercise', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            const data = await res.json();
            UnifiedState.activeWorkout = MacraCrypto.decrypt(data.session, MacraCrypto.getAthleteCode());
            renderWorkoutPanel();
            
            // Get AI prediction for next exercise
            getPrediction();
            
            showToast(`✓ ${exerciseName} logged`);
            return UnifiedState.activeWorkout;
        } else {
            const err = await res.json();
            console.error('Add exercise error:', err);
            showToast('❌ Failed to log exercise');
        }
    } catch (e) {
        console.error('Add exercise error:', e);
        showToast('❌ Failed to log exercise');
    }
    return null;
}

/**
 * Quick add set - auto-populates from last exercise or specified exercise
 */
async function quickAddSet(exerciseId = null, exerciseName = null) {
    let weight, reps;
    
    if (exerciseId && UnifiedState.activeWorkout) {
        // Find the exercise and get last set values
        const exercise = UnifiedState.activeWorkout.exercises?.find(e => e.id === exerciseId);
        if (exercise && exercise.sets && exercise.sets.length > 0) {
            const lastSet = exercise.sets[exercise.sets.length - 1];
            weight = lastSet.weight;
            reps = lastSet.reps;
            exerciseName = exercise.name;
        }
    } else if (UnifiedState.lastExercise) {
        // Use last logged exercise
        weight = UnifiedState.lastExercise.weight;
        reps = UnifiedState.lastExercise.reps;
        exerciseName = UnifiedState.lastExercise.name;
    }
    
    if (!exerciseName) {
        showToast('No previous exercise to copy');
        return;
    }
    
    // Add the set with same values
    await addExercise(exerciseName, weight, reps, 1);
}

/**
 * Update an existing set
 */
async function updateSet(exerciseId, setNum, weight, reps, rpe = null) {
    if (!UnifiedState.activeWorkout) return null;
    
    try {
        const updateData = {
            session_id: UnifiedState.activeWorkout.id,
            exercise_id: exerciseId,
            set_num: setNum,
            weight: parseFloat(weight) || 0,
            reps: parseInt(reps) || 0,
            rpe: rpe ? parseFloat(rpe) : null
        };
        
        const payload = MacraCrypto.encrypt(updateData, MacraCrypto.getAthleteCode());
        
        const res = await unifiedApiCall('/api/v2/workout/set', {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            const data = await res.json();
            UnifiedState.activeWorkout = MacraCrypto.decrypt(data.session, MacraCrypto.getAthleteCode());
            renderWorkoutPanel();
            return UnifiedState.activeWorkout;
        }
    } catch (e) {
        console.error('Update set error:', e);
    }
    return null;
}

/**
 * Handle inline edit save - called from editable set fields
 * Debounced to avoid rapid-fire API calls while typing
 */
const _pendingEdits = {};
function handleInlineEdit(exerciseId, setNum) {
    const key = `${exerciseId}-${setNum}`;
    
    // Clear any pending debounce for this set
    if (_pendingEdits[key]) clearTimeout(_pendingEdits[key]);
    
    _pendingEdits[key] = setTimeout(() => {
        const weightInput = document.querySelector(`[data-edit-weight="${exerciseId}-${setNum}"]`);
        const repsInput = document.querySelector(`[data-edit-reps="${exerciseId}-${setNum}"]`);
        
        if (!weightInput || !repsInput) return;
        
        const newWeight = parseFloat(weightInput.value) || 0;
        const newReps = parseInt(repsInput.value) || 0;
        
        // Only update if values actually changed
        const exercise = UnifiedState.activeWorkout?.exercises?.find(e => e.id === exerciseId);
        const set = exercise?.sets?.find(s => s.set_num === setNum);
        
        if (set && (set.weight !== newWeight || set.reps !== newReps)) {
            updateSet(exerciseId, setNum, newWeight, newReps, set.rpe);
        }
        
        delete _pendingEdits[key];
    }, 800); // 800ms debounce
}

/**
 * Delete an exercise or specific set
 */
async function deleteExercise(exerciseId, setNum = null) {
    if (!UnifiedState.activeWorkout) return null;
    
    try {
        const res = await unifiedApiCall('/api/v2/workout/exercise', {
            method: 'DELETE',
            body: JSON.stringify({
                session_id: UnifiedState.activeWorkout.id,
                exercise_id: exerciseId,
                set_num: setNum
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            UnifiedState.activeWorkout = MacraCrypto.decrypt(data.session, MacraCrypto.getAthleteCode());
            renderWorkoutPanel();
            showToast('🗑️ Deleted');
            return UnifiedState.activeWorkout;
        }
    } catch (e) {
        console.error('Delete exercise error:', e);
    }
    return null;
}

/**
 * FINALIZE WORKOUT
 * ══════════════════════════════════════════════════════════════
 * FIX #1: Now saves workout summary to appData.activities[dateKey]
 * FIX #2: Has timeout + guaranteed state cleanup to prevent ghost sessions
 */
async function finalizeWorkout(workoutName = null, notes = null) {
    if (!UnifiedState.activeWorkout) {
        showToast('No active workout to finalize');
        return null;
    }
    
    // ── SNAPSHOT workout data BEFORE the API call ──
    // This ensures we have the data even if the API clears it or times out
    const workoutSnapshot = JSON.parse(JSON.stringify(UnifiedState.activeWorkout));
    const sessionId = workoutSnapshot.id;
    const finalName = workoutName || workoutSnapshot.workout_name || 'Workout';
    
    // Pre-calculate summary from local state (fallback if API summary is incomplete)
    const localSummary = {
        total_exercises: workoutSnapshot.exercises?.length || 0,
        total_sets: workoutSnapshot.exercises?.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0) || 0,
        total_volume: workoutSnapshot.exercises?.reduce((sum, ex) => {
            return sum + (ex.sets || []).reduce((setSum, set) => setSum + ((set.weight || 0) * (set.reps || 0)), 0);
        }, 0) || 0,
        exercises: workoutSnapshot.exercises?.map(ex => ({
            name: ex.name,
            category: ex.category || 'other',
            sets: ex.sets?.map(s => ({ weight: s.weight, reps: s.reps, rpe: s.rpe })) || []
        })) || [],
        duration: getElapsedTime(),
        started_at: workoutSnapshot.started_at
    };
    
    let apiResult = null;
    let apiSuccess = false;
    
    try {
        const finalizeData = {
            session_id: sessionId,
            workout_name: finalName,
            notes: notes
        };
        
        const payload = MacraCrypto.encrypt(finalizeData, MacraCrypto.getAthleteCode());
        
        // ── FIX #2: Use timeout to prevent hanging ──
        const res = await unifiedApiCallWithTimeout('/api/v2/workout/finalize', {
            method: 'POST',
            body: JSON.stringify(payload)
        }, 15000);
        
        if (res.ok) {
            const data = await res.json();
            apiResult = data.session;
            apiSuccess = true;
        } else {
            const err = await res.json().catch(() => ({ error: 'Unknown error' }));
            console.error('Finalize API error:', err);
            // Don't return yet — still save locally and clean up state
        }
    } catch (e) {
        console.error('Finalize workout error:', e);
        // Don't return — still save locally and clean up state
    }
    
    // ── FIX #1: Save workout to appData.activities for Today's Activity ──
    try {
        const dateKey = getTodayKey();
        if (!appData.activities) appData.activities = {};
        if (!appData.activities[dateKey]) appData.activities[dateKey] = [];
        
        // Use API summary if available, otherwise use local snapshot
        const summary = apiResult?.summary || localSummary;
        
        const activityEntry = {
            type: 'workout',
            name: finalName,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now(),
            notes: notes || '',
            summary: {
                exercises: summary.total_exercises || localSummary.total_exercises,
                sets: summary.total_sets || localSummary.total_sets,
                volume: summary.total_volume || localSummary.total_volume,
                duration: localSummary.duration
            },
            exerciseDetails: localSummary.exercises,
            sessionId: sessionId,
            source: 'v2'
        };
        
        appData.activities[dateKey].push(activityEntry);
        
        // Save to localStorage
        if (typeof saveData === 'function') {
            saveData();
        }
        
        console.log('✅ Workout saved to appData.activities:', dateKey, activityEntry);
    } catch (saveErr) {
        console.error('Failed to save workout to activities:', saveErr);
    }
    
    // ── ALWAYS clean up state (prevents ghost sessions) ──
    stopWorkoutTimer();
    UnifiedState.activeWorkout = null;
    UnifiedState.prediction = null;
    UnifiedState.lastExercise = null;
    
    // Update UI
    renderWorkoutPanel();
    
    // Success/partial-success message
    const exerciseCount = localSummary.total_exercises;
    const totalVolume = localSummary.total_volume;
    
    if (apiSuccess) {
        showToast(`🏁 ${finalName} complete! ${exerciseCount} exercises, ${totalVolume.toLocaleString()} lbs`);
    } else {
        showToast(`⚠️ ${finalName} saved locally (${exerciseCount} exercises, ${totalVolume.toLocaleString()} lbs) — cloud sync may have failed`);
    }
    
    // Trigger dashboard refresh
    if (typeof renderDashboard === 'function') {
        renderDashboard();
    }
    if (typeof refreshDashboard === 'function') {
        refreshDashboard();
    }
    
    // Return result for integration patch
    return {
        success: true,
        apiSuccess: apiSuccess,
        session: apiResult,
        summary: localSummary,
        activitySaved: true
    };
}

/**
 * Cancel workout without saving
 */
async function cancelWorkout() {
    if (!UnifiedState.activeWorkout) return;
    
    const exerciseCount = UnifiedState.activeWorkout.exercises?.length || 0;
    if (exerciseCount > 0) {
        if (!confirm(`Cancel workout? Your ${exerciseCount} logged exercises will be lost.`)) {
            return;
        }
    }
    
    try {
        await unifiedApiCall('/api/v2/workout/cancel', {
            method: 'POST',
            body: JSON.stringify({ session_id: UnifiedState.activeWorkout.id })
        });
    } catch (e) {
        console.log('Cancel API error (continuing anyway):', e);
    }
    
    // Stop timer
    stopWorkoutTimer();
    
    // Clear state
    UnifiedState.activeWorkout = null;
    UnifiedState.prediction = null;
    UnifiedState.lastExercise = null;
    
    // Update UI
    renderWorkoutPanel();
    showToast('Workout cancelled');
}

// ═══════════════════════════════════════════════════════════════
// TIMER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function startWorkoutTimer() {
    stopWorkoutTimer(); // Clear any existing
    
    UnifiedState.timerInterval = setInterval(() => {
        updateTimerDisplay();
    }, 1000);
}

function stopWorkoutTimer() {
    if (UnifiedState.timerInterval) {
        clearInterval(UnifiedState.timerInterval);
        UnifiedState.timerInterval = null;
    }
}

function updateTimerDisplay() {
    const timerEl = document.getElementById('workoutTimer');
    if (!timerEl || !UnifiedState.activeWorkout?.started_at) return;
    
    const startTime = new Date(UnifiedState.activeWorkout.started_at).getTime();
    const elapsed = Date.now() - startTime;
    
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    if (hours > 0) {
        timerEl.textContent = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
        timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

function getElapsedTime() {
    if (!UnifiedState.activeWorkout?.started_at) return '0:00';
    
    const startTime = new Date(UnifiedState.activeWorkout.started_at).getTime();
    const elapsed = Date.now() - startTime;
    
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes} min`;
}

// ═══════════════════════════════════════════════════════════════
// AI PREDICTION
// ═══════════════════════════════════════════════════════════════

async function getPrediction() {
    if (!UnifiedState.activeWorkout?.exercises?.length) {
        UnifiedState.prediction = null;
        return null;
    }
    
    try {
        const exerciseNames = UnifiedState.activeWorkout.exercises.map(e => e.name);
        const res = await unifiedApiCall('/api/v2/learning/predict-next', {
            method: 'POST',
            body: JSON.stringify({ current_exercises: exerciseNames })
        });
        
        if (res.ok) {
            const data = await res.json();
            UnifiedState.prediction = data.prediction;
            renderWorkoutPanel(); // Re-render to show prediction
            return data.prediction;
        }
    } catch (e) {
        console.error('Get prediction error:', e);
    }
    return null;
}

function acceptPrediction() {
    if (!UnifiedState.prediction) return;
    
    const input = document.getElementById('unifiedInput') || document.getElementById('v2ExerciseInput');
    if (input) {
        input.value = UnifiedState.prediction.exercise;
        input.focus();
    }
}

function dismissPrediction() {
    UnifiedState.prediction = null;
    renderWorkoutPanel();
}

// ═══════════════════════════════════════════════════════════════
// UI RENDERING
// ═══════════════════════════════════════════════════════════════

function getCategoryEmoji(category) {
    const emojis = {
        chest: '🫁',
        back: '🔙',
        shoulders: '🎯',
        arms: '💪',
        legs: '🦵',
        core: '🧘',
        cardio: '❤️',
        other: '🏋️'
    };
    return emojis[category?.toLowerCase()] || '🏋️';
}

/**
 * Main workout panel render function
 * ══════════════════════════════════════════════════════════════
 * FIX #3: Set rows now have inline-editable weight/reps inputs
 */
function renderWorkoutPanel() {
    const panel = document.getElementById('v2WorkoutPanel');
    if (!panel) {
        console.warn('v2WorkoutPanel element not found');
        return;
    }
    
    // No active workout - show start button
    if (!UnifiedState.activeWorkout) {
        panel.innerHTML = `
            <div class="v2-workout-start" style="text-align: center; padding: 24px;">
                <p style="color: var(--white-50); margin-bottom: 16px;">Ready to train?</p>
                <button class="btn btn-primary" onclick="startWorkout()">
                    🏋️ Start Workout
                </button>
            </div>
        `;
        panel.style.display = 'block';
        return;
    }
    
    const workout = UnifiedState.activeWorkout;
    const elapsedTime = getElapsedTime();
    
    // Build exercises HTML with inline-editable set fields
    let exercisesHTML = '';
    if (workout.exercises && workout.exercises.length > 0) {
        exercisesHTML = workout.exercises.map(ex => `
            <div class="v2-exercise-card" data-id="${ex.id}" style="background: var(--onyx); border: 1px solid var(--white-10); border-radius: 12px; padding: 16px; margin-bottom: 12px;">
                <div class="v2-exercise-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <span class="v2-exercise-name" style="font-weight: 600; font-size: 16px;">
                        ${getCategoryEmoji(ex.category)} ${ex.name}
                    </span>
                    <div class="v2-exercise-actions" style="display: flex; gap: 8px;">
                        <button class="btn-icon" onclick="deleteExercise('${ex.id}')" title="Delete" style="background: none; border: none; cursor: pointer; opacity: 0.6;">🗑️</button>
                    </div>
                </div>
                <div class="v2-sets-list">
                    <div class="v2-set-header" style="display: flex; align-items: center; gap: 12px; padding: 4px 12px; font-size: 11px; color: var(--white-30); text-transform: uppercase; letter-spacing: 0.5px;">
                        <span style="min-width: 50px;">Set</span>
                        <span style="min-width: 80px;">Weight</span>
                        <span style="min-width: 60px;">Reps</span>
                        <span style="margin-left: auto; min-width: 20px;"></span>
                    </div>
                    ${(ex.sets || []).map(set => `
                        <div class="v2-set-row" data-set="${set.set_num}" style="display: flex; align-items: center; gap: 12px; padding: 6px 12px; background: var(--carbon); border-radius: 8px; margin-bottom: 6px; font-size: 14px;">
                            <span class="v2-set-num" style="color: var(--white-50); min-width: 50px;">Set ${set.set_num}</span>
                            <div style="min-width: 80px; display: flex; align-items: center; gap: 4px;">
                                <input type="number" 
                                    data-edit-weight="${ex.id}-${set.set_num}"
                                    value="${set.weight}" 
                                    style="width: 60px; background: var(--onyx); border: 1px solid var(--white-10); border-radius: 6px; color: var(--prism-cyan); font-weight: 600; font-size: 14px; padding: 4px 6px; text-align: right; -moz-appearance: textfield;"
                                    onchange="handleInlineEdit('${ex.id}', ${set.set_num})"
                                    onfocus="this.select()"
                                >
                                <span style="color: var(--white-30); font-size: 11px;">lbs</span>
                            </div>
                            <div style="min-width: 60px; display: flex; align-items: center; gap: 4px;">
                                <span style="color: var(--white-30);">×</span>
                                <input type="number" 
                                    data-edit-reps="${ex.id}-${set.set_num}"
                                    value="${set.reps}" 
                                    style="width: 48px; background: var(--onyx); border: 1px solid var(--white-10); border-radius: 6px; color: var(--prism-violet); font-weight: 600; font-size: 14px; padding: 4px 6px; text-align: right; -moz-appearance: textfield;"
                                    onchange="handleInlineEdit('${ex.id}', ${set.set_num})"
                                    onfocus="this.select()"
                                >
                            </div>
                            ${set.rpe ? `<span class="v2-set-rpe" style="color: var(--prism-amber); font-size: 12px;">RPE ${set.rpe}</span>` : ''}
                            <button class="btn-icon-sm" onclick="deleteExercise('${ex.id}', ${set.set_num})" style="background: none; border: none; cursor: pointer; font-size: 12px; opacity: 0.5; margin-left: auto;">×</button>
                        </div>
                    `).join('')}
                </div>
                <button class="btn btn-ghost btn-sm" onclick="quickAddSet('${ex.id}', '${ex.name}')" style="font-size: 12px; padding: 6px 12px;">
                    + Add Set (${ex.sets?.[ex.sets.length - 1]?.weight || 0} lbs × ${ex.sets?.[ex.sets.length - 1]?.reps || 0})
                </button>
            </div>
        `).join('');
    }
    
    // Prediction card
    let predictionHTML = '';
    if (UnifiedState.prediction) {
        predictionHTML = `
            <div class="v2-prediction-card" style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(6, 182, 212, 0.1)); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; padding: 16px; margin: 16px 0;">
                <div style="font-size: 12px; color: var(--prism-emerald); margin-bottom: 4px;">🔮 Predicted Next:</div>
                <div style="font-size: 18px; font-weight: 600; margin-bottom: 4px;">${UnifiedState.prediction.exercise}</div>
                <div style="font-size: 12px; color: var(--white-50); margin-bottom: 12px;">${UnifiedState.prediction.reason || ''}</div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-primary btn-sm" onclick="acceptPrediction()">✓ Yes, Log It</button>
                    <button class="btn btn-ghost btn-sm" onclick="dismissPrediction()">Different Exercise</button>
                </div>
            </div>
        `;
    }
    
    // Calculate stats
    const totalExercises = workout.exercises?.length || 0;
    const totalSets = workout.exercises?.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0) || 0;
    const totalVolume = workout.exercises?.reduce((sum, ex) => {
        return sum + (ex.sets || []).reduce((setSum, set) => setSum + (set.weight * set.reps), 0);
    }, 0) || 0;
    
    panel.innerHTML = `
        <div class="v2-workout-header" style="padding: 16px; background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.2)); border-radius: 12px; margin-bottom: 16px;">
            <div class="v2-workout-title" style="display: flex; justify-content: space-between; align-items: center;">
                <span class="v2-workout-status" style="font-size: 12px; font-weight: 600; letter-spacing: 1px; color: var(--prism-rose); animation: pulse 2s infinite;">🔴 WORKOUT IN PROGRESS</span>
                <span class="v2-workout-timer" style="font-family: var(--font-display);">⏱️ <span id="workoutTimer">${elapsedTime}</span></span>
            </div>
            <div class="v2-workout-name" style="font-size: 20px; font-weight: 600; margin-top: 8px;">${workout.workout_name || 'Workout'}</div>
        </div>
        
        <div class="v2-exercises-container">
            ${exercisesHTML || '<div style="text-align: center; padding: 24px; color: var(--white-30);">No exercises yet. Add your first exercise below!</div>'}
        </div>
        
        ${predictionHTML}
        
        <div class="v2-quick-input" style="display: flex; gap: 12px; margin: 16px 0;">
            <input type="text" id="v2ExerciseInput" class="form-input" style="flex: 1;"
                placeholder="Type exercise (e.g., 'bench press 185 x 8' or 'BP 135x10')"
                onkeypress="if(event.key==='Enter') parseAndAddExercise()">
            <button class="btn btn-primary" onclick="parseAndAddExercise()">Add</button>
        </div>
        
        <div class="v2-workout-footer" style="display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 1px solid var(--white-10); margin-top: 16px;">
            <div class="v2-workout-stats" style="font-size: 14px; color: var(--white-50); display: flex; gap: 8px;">
                <span>${totalExercises} exercises</span>
                <span>•</span>
                <span>${totalSets} sets</span>
                <span>•</span>
                <span>${totalVolume.toLocaleString()} lbs</span>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn btn-ghost" onclick="cancelWorkout()" style="color: var(--prism-rose);">
                    ✖ Cancel
                </button>
                <button class="btn btn-primary" onclick="showFinalizeModal()">
                    ✅ FINALIZE WORKOUT
                </button>
            </div>
        </div>
    `;
    
    panel.style.display = 'block';
    
    // Start timer if not already running
    if (!UnifiedState.timerInterval) {
        startWorkoutTimer();
    }
}

/**
 * Show finalize workout modal
 */
function showFinalizeModal() {
    const workout = UnifiedState.activeWorkout;
    if (!workout) return;
    
    const totalExercises = workout.exercises?.length || 0;
    const totalSets = workout.exercises?.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0) || 0;
    const totalVolume = workout.exercises?.reduce((sum, ex) => {
        return sum + (ex.sets || []).reduce((setSum, set) => setSum + (set.weight * set.reps), 0);
    }, 0) || 0;
    
    const modalHTML = `
        <div class="modal-overlay" id="finalizeModal" onclick="if(event.target===this) this.remove()" style="position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;">
            <div class="modal-content" style="background: var(--carbon); border-radius: 16px; padding: 24px; max-width: 400px; width: 90%; max-height: 90vh; overflow-y: auto;">
                <h2 style="margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">✅ Finalize Workout</h2>
                
                <div class="form-group" style="margin-bottom: 16px;">
                    <label class="form-label" style="display: block; margin-bottom: 8px; color: var(--white-70);">Workout Name</label>
                    <input type="text" id="finalizeWorkoutName" class="form-input" 
                        value="${workout.workout_name || ''}" 
                        placeholder="Push Day, Leg Day, etc."
                        style="width: 100%; padding: 12px; background: var(--onyx); border: 1px solid var(--white-10); border-radius: 8px; color: var(--white);">
                </div>
                
                <div class="form-group" style="margin-bottom: 16px;">
                    <label class="form-label" style="display: block; margin-bottom: 8px; color: var(--white-70);">Notes (optional)</label>
                    <textarea id="finalizeWorkoutNotes" class="form-input" rows="3" 
                        placeholder="How did it feel? Any PRs?"
                        style="width: 100%; padding: 12px; background: var(--onyx); border: 1px solid var(--white-10); border-radius: 8px; color: var(--white); resize: vertical;"></textarea>
                </div>
                
                <div style="margin: 16px 0; padding: 12px; background: var(--onyx); border-radius: 8px;">
                    <div style="font-size: 14px; color: var(--white-50); margin-bottom: 8px;">Summary</div>
                    <div style="font-size: 16px;">
                        <strong>${totalExercises}</strong> exercises • 
                        <strong>${totalSets}</strong> sets • 
                        <strong>${totalVolume.toLocaleString()}</strong> lbs
                    </div>
                    <div style="font-size: 12px; color: var(--white-50); margin-top: 4px;">
                        Duration: ${getElapsedTime()}
                    </div>
                </div>
                
                <div style="display: flex; gap: 12px; margin-top: 24px;">
                    <button class="btn btn-ghost" onclick="document.getElementById('finalizeModal').remove()" style="flex: 1;">
                        Cancel
                    </button>
                    <button class="btn btn-primary" style="flex: 2;" onclick="doFinalize()">
                        ✅ Complete Workout
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.getElementById('finalizeWorkoutName').focus();
}

async function doFinalize() {
    const name = document.getElementById('finalizeWorkoutName')?.value;
    const notes = document.getElementById('finalizeWorkoutNotes')?.value;
    
    // Disable button to prevent double-click
    const btn = document.querySelector('#finalizeModal .btn-primary');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Saving...';
    }
    
    await finalizeWorkout(name, notes);
    document.getElementById('finalizeModal')?.remove();
}

// ═══════════════════════════════════════════════════════════════
// UNIFIED INPUT PARSING
// ═══════════════════════════════════════════════════════════════

/**
 * Parse user input and add exercise
 * Replaces the old dual parseUnifiedInputV2() / v2ParseExercise() split
 */
async function parseAndAddExercise() {
    const input = document.getElementById('v2ExerciseInput') || document.getElementById('unifiedInput');
    if (!input || !input.value.trim()) return;
    
    const rawInput = input.value.trim();
    
    try {
        // Try AI parsing first
        const res = await unifiedApiCall('/api/v2/learning/parse-exercise', {
            method: 'POST',
            body: JSON.stringify({ input: rawInput })
        });
        
        if (res.ok) {
            const data = await res.json();
            const parsed = data.parsed;
            
            if (parsed && parsed.standard_name) {
                await addExercise(
                    parsed.standard_name,
                    parsed.weight || 0,
                    parsed.reps || 0,
                    parsed.sets || 1,
                    parsed.rpe || null
                );
                input.value = '';
                return;
            }
        }
        
        // Fallback: Basic regex parsing
        const basicParsed = parseExerciseBasic(rawInput);
        if (basicParsed) {
            await addExercise(
                basicParsed.name,
                basicParsed.weight,
                basicParsed.reps,
                basicParsed.sets,
                null
            );
            input.value = '';
            return;
        }
        
        showToast('❓ Could not parse. Try: "bench press 135 x 10"');
    } catch (e) {
        console.error('Parse exercise error:', e);
        showToast('❌ Failed to parse exercise');
    }
}

/**
 * Basic regex fallback parser
 */
function parseExerciseBasic(input) {
    // Pattern: "exercise name 135lbs 3x10" or "exercise name 135 x 10"
    const patterns = [
        /^(.+?)\s+(\d+)\s*(?:lbs?|pounds?)?\s*[x×]\s*(\d+)$/i,  // "bench 135 x 10"
        /^(.+?)\s+(\d+)\s*(?:lbs?|pounds?)\s+(\d+)\s*[x×]\s*(\d+)$/i,  // "bench 135lbs 3x10"
        /^(.+?)\s+(\d+)\s*[x×]\s*(\d+)$/i,  // "bench 135x10"
    ];
    
    for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match) {
            if (match.length === 4) {
                return {
                    name: match[1].trim(),
                    weight: parseInt(match[2]),
                    reps: parseInt(match[3]),
                    sets: 1
                };
            } else if (match.length === 5) {
                return {
                    name: match[1].trim(),
                    weight: parseInt(match[2]),
                    sets: parseInt(match[3]),
                    reps: parseInt(match[4])
                };
            }
        }
    }
    
    return null;
}

// ═══════════════════════════════════════════════════════════════
// BRIDGE FUNCTIONS (for backward compatibility)
// ═══════════════════════════════════════════════════════════════

// These map old function names to new unified system
window.v2StartWorkout = startWorkout;
window.v2AddExercise = addExercise;
window.v2FinalizeWorkout = finalizeWorkout;
window.v2CancelWorkout = cancelWorkout;
window.v2QuickAddSet = quickAddSet;
window.v2DeleteExercise = deleteExercise;
window.v2ShowFinalizeModal = showFinalizeModal;
window.v2DoFinalize = doFinalize;
window.v2AcceptPrediction = acceptPrediction;
window.v2DismissPrediction = dismissPrediction;
window.v2ParseAndAddExercise = parseAndAddExercise;

// Also expose the old updateV2WorkoutUI name
window.updateV2WorkoutUI = renderWorkoutPanel;

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

async function initUnifiedWorkout() {
    console.log('🚀 Initializing MACRA v2.1 Unified Workout System...');
    
    // Check if logged in
    const auth = JSON.parse(localStorage.getItem('macra_auth') || '{}');
    if (!auth.token) {
        console.log('Not authenticated, skipping workout init');
        return;
    }
    
    // Check for encryption capability
    if (MacraCrypto.isEnabled()) {
        console.log('🔐 Client-side encryption enabled');
    } else {
        console.log('⚠️ Running without encryption (v2.0 mode)');
    }
    
    try {
        // Load any active workout
        await getActiveWorkout();

             // Auto-cancel stale sessions (older than 4 hours)
        if (UnifiedState.activeWorkout?.started_at) {
            const age = Date.now() - new Date(UnifiedState.activeWorkout.started_at).getTime();
            const FOUR_HOURS = 4 * 60 * 60 * 1000;
            if (age > FOUR_HOURS) {
                console.warn('⚠️ Stale workout detected (' + Math.round(age / 3600000) + 'h old), auto-cancelling...');
                try {
                    await unifiedApiCall('/api/v2/workout/cancel', {
                        method: 'POST',
                        body: JSON.stringify({ session_id: UnifiedState.activeWorkout.id })
                    });
                } catch (e) { console.log('Stale cancel error:', e); }
                UnifiedState.activeWorkout = null;
            }
        }
                
        // Render UI
        renderWorkoutPanel();
        
        // Get prediction if workout active
        if (UnifiedState.activeWorkout) {
            startWorkoutTimer();
            await getPrediction();
        }
        
        console.log('✅ MACRA v2.1 Unified Workout System initialized');
    } catch (e) {
        console.error('Unified workout init error:', e);
    }
}

// Listen for online/offline status
window.addEventListener('online', () => {
    UnifiedState.isOnline = true;
    showToast('📶 Back online');
    // TODO: Process sync queue
});

window.addEventListener('offline', () => {
    UnifiedState.isOnline = false;
    showToast('📴 Working offline');
});

// Initialize when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initUnifiedWorkout, 1500);
    });
} else {
    setTimeout(initUnifiedWorkout, 1500);
}

console.log('📦 MACRA v2.1 Unified Workout module loaded');
