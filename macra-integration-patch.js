/**
 * MACRA v2.1 Integration Patch
 * ══════════════════════════════════════════════════════════════
 * 
 * This patch connects the "Log Anything" input to the v2 Workout System.
 * When exercises are detected, they flow through the unified API instead
 * of being saved directly to localStorage.
 * 
 * FLOW:
 * Log Anything → AI Parser → handleWorkoutSession() → v2 API → Workout Panel
 * 
 * @version 2.1.1
 */

// ═══════════════════════════════════════════════════════════════
// OVERRIDE: handleWorkoutSession - Route to v2 API
// ═══════════════════════════════════════════════════════════════

/**
 * New handleWorkoutSession that routes exercises through v2 API
 * This replaces the old localStorage-only version
 */
window.handleWorkoutSession = async function(exercises) {
    const now = new Date();
    
    console.log('🏋️ handleWorkoutSession called with', exercises.length, 'exercises');
    
    // Check if v2 system is available
    if (typeof UnifiedState === 'undefined' || typeof addExercise !== 'function') {
        console.warn('V2 system not loaded, falling back to legacy');
        handleWorkoutSessionLegacy(exercises);
        return;
    }
    
    // Auto-start workout if not active
    if (!UnifiedState.activeWorkout) {
        console.log('🚀 Auto-starting workout...');
        await startWorkout();
        
        // Wait a moment for the workout to initialize
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Add each exercise to the v2 system
    for (const ex of exercises) {
        try {
            // Add to v2 API
            await addExercise(
                ex.name,
                ex.weight || 0,
                ex.reps || 0,
                ex.sets || 1,
                ex.rpe || null
            );
            
            // Also update local exercise memory for suggestions
            updateExerciseMemory(ex);
            
            console.log(`✓ Added: ${ex.name} ${ex.weight}lbs × ${ex.reps}`);
        } catch (error) {
            console.error('Failed to add exercise:', ex.name, error);
        }
    }
    
    // Update the smart workout panel (legacy UI)
    if (typeof updateSmartWorkoutPanel === 'function') {
        updateSmartWorkoutPanel();
    }
    
    // Scroll to workout panel if on dashboard
    const workoutPanel = document.getElementById('v2WorkoutPanel');
    if (workoutPanel) {
        workoutPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

/**
 * Legacy fallback for when v2 system isn't loaded
 */
function handleWorkoutSessionLegacy(exercises) {
    const now = new Date();
    
    if (!currentSession.active || (now - new Date(currentSession.startTime)) > 2 * 60 * 60 * 1000) {
        currentSession = {
            active: true,
            startTime: now.toISOString(),
            exercises: [],
            lastExercise: null
        };
    }
    
    exercises.forEach(ex => {
        updateExerciseMemory(ex);
        currentSession.exercises.push(ex);
        currentSession.lastExercise = ex;
    });
    
    if (typeof updateSmartWorkoutPanel === 'function') {
        updateSmartWorkoutPanel();
    }
}

/**
 * Update exercise memory for suggestions (works with both systems)
 */
function updateExerciseMemory(ex) {
    const exKey = normalizeExerciseName(ex.name);
    
    if (!appData.exerciseMemory) appData.exerciseMemory = {};
    if (!appData.exerciseMemory[exKey]) {
        appData.exerciseMemory[exKey] = { frequency: 0, history: [] };
    }
    
    appData.exerciseMemory[exKey].lastWeight = ex.weight;
    appData.exerciseMemory[exKey].lastReps = ex.reps;
    appData.exerciseMemory[exKey].lastSets = ex.sets;
    appData.exerciseMemory[exKey].frequency++;
    appData.exerciseMemory[exKey].lastPerformed = getTodayKey();
    
    // Track exercise sequence for suggestions
    if (currentSession.lastExercise) {
        const lastKey = normalizeExerciseName(currentSession.lastExercise.name);
        if (!appData.exerciseMemory[lastKey].followedBy) {
            appData.exerciseMemory[lastKey].followedBy = {};
        }
        appData.exerciseMemory[lastKey].followedBy[exKey] =
            (appData.exerciseMemory[lastKey].followedBy[exKey] || 0) + 1;
    }
    
    // Update currentSession for legacy compatibility
    currentSession.exercises.push(ex);
    currentSession.lastExercise = ex;
}

// ═══════════════════════════════════════════════════════════════
// OVERRIDE: processUnifiedResult - Better workout handling
// ═══════════════════════════════════════════════════════════════

// Store reference to original function
const originalProcessUnifiedResult = window.processUnifiedResult;

/**
 * Enhanced processUnifiedResult that properly routes workouts
 */
window.processUnifiedResult = async function(result, rawInput) {
    // For workouts, use the new v2 flow
    if (result.type === 'workout' && result.data.exercises && result.data.exercises.length > 0) {
        console.log('🎯 Workout detected, routing through v2 system...');
        
        // Don't save to localStorage activities for workouts - v2 handles this
        // Just trigger the workout session handler
        await handleWorkoutSession(result.data.exercises);
        
        // Still check for PRs
        if (typeof checkForPRs === 'function') {
            checkForPRs(result.data.exercises);
        }
        
        // Award points
        const points = currentSession.exercises.length === 1 ? 25 : 10;
        appData.stats.points += points;
        appData.stats.weeklyPoints += points;
        
        // Save memory and stats (but not the workout to activities)
        saveData();
        
        // Update dashboard
        if (typeof renderDashboard === 'function') {
            renderDashboard();
        }
        
        showToast(`✓ ${result.data.exercises.length} exercise${result.data.exercises.length > 1 ? 's' : ''} added to workout`);
        return;
    }
    
    // For non-workout types, use original function
    if (typeof originalProcessUnifiedResult === 'function') {
        originalProcessUnifiedResult(result, rawInput);
    }
};

// ═══════════════════════════════════════════════════════════════
// FINALIZE INTEGRATION: Stats update on finalize
// ═══════════════════════════════════════════════════════════════

// Store reference to original finalize
const originalFinalizeWorkout = window.finalizeWorkout;

/**
 * Enhanced finalizeWorkout that updates dashboard stats
 */
window.finalizeWorkout = async function(workoutName, notes) {
    // Call original finalize
    const result = await originalFinalizeWorkout(workoutName, notes);
    
    if (result) {
        // Update stats
        appData.stats.workouts = (appData.stats.workouts || 0) + 1;
        appData.stats.weeklyWorkouts = (appData.stats.weeklyWorkouts || 0) + 1;
        
        // Calculate total volume from the workout
        const totalVolume = result.summary?.total_volume || 0;
        appData.stats.totalVolume = (appData.stats.totalVolume || 0) + totalVolume;
        appData.stats.weeklyVolume = (appData.stats.weeklyVolume || 0) + totalVolume;
        
        // Update streak
        updateStreak();
        
        // Save to localStorage for dashboard
        saveData();
        
        // Refresh dashboard
        if (typeof renderDashboard === 'function') {
            renderDashboard();
        }
        
        // Clear the legacy currentSession
        currentSession = {
            active: false,
            startTime: null,
            exercises: [],
            lastExercise: null
        };
        
        console.log('✅ Workout finalized, stats updated');
    }
    
    return result;
};

/**
 * Update workout streak
 */
function updateStreak() {
    const today = getTodayKey();
    const lastWorkout = appData.stats.lastWorkoutDate;
    
    if (!lastWorkout) {
        appData.stats.streak = 1;
    } else {
        const lastDate = new Date(lastWorkout);
        const todayDate = new Date(today);
        const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
            // Consecutive day - increase streak
            appData.stats.streak = (appData.stats.streak || 0) + 1;
        } else if (diffDays > 1) {
            // Streak broken
            appData.stats.streak = 1;
        }
        // Same day - keep streak as is
    }
    
    appData.stats.lastWorkoutDate = today;
}

// ═══════════════════════════════════════════════════════════════
// CANCEL INTEGRATION: Stats cleanup on cancel
// ═══════════════════════════════════════════════════════════════

const originalCancelWorkout = window.cancelWorkout;

window.cancelWorkout = async function() {
    await originalCancelWorkout();
    
    // Clear legacy session
    currentSession = {
        active: false,
        startTime: null,
        exercises: [],
        lastExercise: null
    };
    
    // Refresh dashboard
    if (typeof renderDashboard === 'function') {
        renderDashboard();
    }
};

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

console.log('🔗 MACRA v2.1 Integration Patch loaded');
console.log('   • Log Anything → v2 Workout System: CONNECTED');
console.log('   • Exercise Memory: ACTIVE');
console.log('   • Stats Integration: ACTIVE');
