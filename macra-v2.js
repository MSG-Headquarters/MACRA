/**
 * MACRA v2.0 API Integration
 * This script adds v2 workout sessions and nutrition tracking
 * Include this after the main MACRA script
 */

// ═══════════════════════════════════════════════════════════════
// V2 STATE
// ═══════════════════════════════════════════════════════════════
let v2State = {
    activeWorkout: null,
    todayNutrition: null,
    learningProfile: null,
    prediction: null
};

// ═══════════════════════════════════════════════════════════════
// V2 API CALLS
// ═══════════════════════════════════════════════════════════════

async function v2ApiCall(endpoint, options = {}) {
    const token = localStorage.getItem('macra_token');
    const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
    };
    
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: { ...headers, ...options.headers }
        });
        return response;
    } catch (error) {
        console.error('V2 API Error:', error);
        throw error;
    }
}

// ═══════════════════════════════════════════════════════════════
// WORKOUT SESSION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async function v2GetActiveWorkout() {
    try {
        const res = await v2ApiCall('/api/v2/workout/active');
        if (res.ok) {
            const data = await res.json();
            v2State.activeWorkout = data.session;
            return data.session;
        }
    } catch (e) {
        console.error('Get active workout error:', e);
    }
    return null;
}

async function v2StartWorkout(workoutName = null) {
    try {
        const res = await v2ApiCall('/api/v2/workout/start', {
            method: 'POST',
            body: JSON.stringify({ workout_name: workoutName })
        });
        if (res.ok) {
            const data = await res.json();
            v2State.activeWorkout = data.session;
            showToast('🏋️ Workout started!');
            updateV2WorkoutUI();
            return data.session;
        } else {
            const err = await res.json();
            if (err.session_id) {
                // Already have active workout
                return v2GetActiveWorkout();
            }
            throw new Error(err.error);
        }
    } catch (e) {
        console.error('Start workout error:', e);
        showToast('❌ Failed to start workout');
    }
    return null;
}

async function v2AddExercise(exerciseName, originalInput, weight, reps, rpe = null) {
    if (!v2State.activeWorkout) {
        await v2StartWorkout();
    }
    
    try {
        const res = await v2ApiCall('/api/v2/workout/exercise', {
            method: 'POST',
            body: JSON.stringify({
                session_id: v2State.activeWorkout.id,
                exercise_name: exerciseName,
                original_input: originalInput,
                weight: weight,
                reps: reps,
                rpe: rpe
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            v2State.activeWorkout = data.session;
            updateV2WorkoutUI();
            await v2GetPrediction();
            return data.session;
        }
    } catch (e) {
        console.error('Add exercise error:', e);
    }
    return null;
}

async function v2UpdateSet(exerciseId, setNum, weight, reps, rpe) {
    if (!v2State.activeWorkout) return null;
    
    try {
        const res = await v2ApiCall('/api/v2/workout/set', {
            method: 'PUT',
            body: JSON.stringify({
                session_id: v2State.activeWorkout.id,
                exercise_id: exerciseId,
                set_num: setNum,
                weight: weight,
                reps: reps,
                rpe: rpe
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            v2State.activeWorkout = data.session;
            updateV2WorkoutUI();
            return data.session;
        }
    } catch (e) {
        console.error('Update set error:', e);
    }
    return null;
}

async function v2DeleteExercise(exerciseId, setNum = null) {
    if (!v2State.activeWorkout) return null;
    
    try {
        const res = await v2ApiCall('/api/v2/workout/exercise', {
            method: 'DELETE',
            body: JSON.stringify({
                session_id: v2State.activeWorkout.id,
                exercise_id: exerciseId,
                set_num: setNum
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            v2State.activeWorkout = data.session;
            updateV2WorkoutUI();
            showToast('🗑️ Deleted');
            return data.session;
        }
    } catch (e) {
        console.error('Delete exercise error:', e);
    }
    return null;
}

async function v2FinalizeWorkout(workoutName = null, notes = null) {
    if (!v2State.activeWorkout) return null;
    
    try {
        const res = await v2ApiCall('/api/v2/workout/finalize', {
            method: 'POST',
            body: JSON.stringify({
                session_id: v2State.activeWorkout.id,
                workout_name: workoutName,
                notes: notes
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            const summary = data.session.summary;
            showToast(`🏁 ${data.session.workout_name || 'Workout'} complete! ${summary.total_exercises} exercises, ${summary.total_volume.toLocaleString()} lbs`);
            v2State.activeWorkout = null;
            v2State.prediction = null;
            updateV2WorkoutUI();
            return data.session;
        }
    } catch (e) {
        console.error('Finalize workout error:', e);
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════
// SMART PARSING
// ═══════════════════════════════════════════════════════════════

async function v2ParseExercise(input) {
    try {
        const res = await v2ApiCall('/api/v2/learning/parse-exercise', {
            method: 'POST',
            body: JSON.stringify({ input })
        });
        
        if (res.ok) {
            const data = await res.json();
            return data.parsed;
        }
    } catch (e) {
        console.error('Parse exercise error:', e);
    }
    return null;
}

async function v2GetPrediction() {
    if (!v2State.activeWorkout || !v2State.activeWorkout.exercises.length) {
        v2State.prediction = null;
        return null;
    }
    
    try {
        const exerciseNames = v2State.activeWorkout.exercises.map(e => e.name);
        const res = await v2ApiCall('/api/v2/learning/predict-next', {
            method: 'POST',
            body: JSON.stringify({ current_exercises: exerciseNames })
        });
        
        if (res.ok) {
            const data = await res.json();
            v2State.prediction = data.prediction;
            updatePredictionUI();
            return data.prediction;
        }
    } catch (e) {
        console.error('Get prediction error:', e);
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════
// NUTRITION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async function v2GetTodayNutrition() {
    try {
        const res = await v2ApiCall('/api/v2/nutrition/today');
        if (res.ok) {
            const data = await res.json();
            v2State.todayNutrition = data.nutrition_day;
            return data.nutrition_day;
        }
    } catch (e) {
        console.error('Get nutrition error:', e);
    }
    return null;
}

async function v2AddFood(name, calories, protein, carbs, fat, mealType = null) {
    try {
        const res = await v2ApiCall('/api/v2/nutrition/food', {
            method: 'POST',
            body: JSON.stringify({
                name,
                calories,
                protein,
                carbs,
                fat,
                meal_type: mealType,
                time: new Date().toISOString()
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            v2State.todayNutrition = data.nutrition_day;
            showToast(`✓ Added to ${data.meal_type}`);
            updateV2NutritionUI();
            return data.nutrition_day;
        }
    } catch (e) {
        console.error('Add food error:', e);
    }
    return null;
}

async function v2UpdateFood(foodId, updates) {
    try {
        const res = await v2ApiCall('/api/v2/nutrition/food', {
            method: 'PUT',
            body: JSON.stringify({
                food_id: foodId,
                ...updates
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            v2State.todayNutrition = data.nutrition_day;
            updateV2NutritionUI();
            return data.nutrition_day;
        }
    } catch (e) {
        console.error('Update food error:', e);
    }
    return null;
}

async function v2DeleteFood(foodId) {
    try {
        const res = await v2ApiCall('/api/v2/nutrition/food', {
            method: 'DELETE',
            body: JSON.stringify({ food_id: foodId })
        });
        
        if (res.ok) {
            const data = await res.json();
            v2State.todayNutrition = data.nutrition_day;
            showToast('🗑️ Food deleted');
            updateV2NutritionUI();
            return data.nutrition_day;
        }
    } catch (e) {
        console.error('Delete food error:', e);
    }
    return null;
}

async function v2LogWater(oz) {
    try {
        const res = await v2ApiCall('/api/v2/nutrition/water', {
            method: 'POST',
            body: JSON.stringify({ oz })
        });
        
        if (res.ok) {
            const data = await res.json();
            v2State.todayNutrition = data.nutrition_day;
            showToast(`💧 +${oz} oz water`);
            updateV2NutritionUI();
            return data.nutrition_day;
        }
    } catch (e) {
        console.error('Log water error:', e);
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════
// UI UPDATE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function updateV2WorkoutUI() {
    const panel = document.getElementById('v2WorkoutPanel');
    if (!panel) return;
    
    if (!v2State.activeWorkout) {
        panel.innerHTML = `
            <div class="v2-workout-start">
                <button class="btn btn-primary" onclick="v2StartWorkout()">
                    🏋️ Start Workout
                </button>
            </div>
        `;
        return;
    }
    
    const workout = v2State.activeWorkout;
    const duration = workout.started_at ? 
        Math.round((Date.now() - new Date(workout.started_at).getTime()) / 60000) : 0;
    
    let exercisesHTML = '';
    if (workout.exercises && workout.exercises.length > 0) {
        exercisesHTML = workout.exercises.map(ex => `
            <div class="v2-exercise-card" data-id="${ex.id}">
                <div class="v2-exercise-header">
                    <span class="v2-exercise-name">${getCategoryEmoji(ex.category)} ${ex.name}</span>
                    <div class="v2-exercise-actions">
                        <button class="btn-icon" onclick="v2EditExercise('${ex.id}')" title="Edit">✏️</button>
                        <button class="btn-icon" onclick="v2DeleteExercise('${ex.id}')" title="Delete">🗑️</button>
                    </div>
                </div>
                <div class="v2-sets-list">
                    ${ex.sets.map(set => `
                        <div class="v2-set-row" data-set="${set.set_num}">
                            <span class="v2-set-num">Set ${set.set_num}</span>
                            <span class="v2-set-weight">${set.weight} lbs</span>
                            <span class="v2-set-reps">× ${set.reps}</span>
                            ${set.rpe ? `<span class="v2-set-rpe">RPE ${set.rpe}</span>` : ''}
                            <button class="btn-icon-sm" onclick="v2DeleteExercise('${ex.id}', ${set.set_num})">×</button>
                        </div>
                    `).join('')}
                </div>
                <button class="btn btn-ghost btn-sm" onclick="v2QuickAddSet('${ex.id}', '${ex.name}')">
                    + Add Set
                </button>
            </div>
        `).join('');
    }
    
    panel.innerHTML = `
        <div class="v2-workout-header">
            <div class="v2-workout-title">
                <span class="v2-workout-status">🔴 WORKOUT IN PROGRESS</span>
                <span class="v2-workout-timer">⏱️ ${duration} min</span>
            </div>
            <div class="v2-workout-name">${workout.workout_name || 'Workout'}</div>
        </div>
        
        <div class="v2-exercises-container">
            ${exercisesHTML || '<div class="v2-empty">No exercises yet. Add your first exercise below!</div>'}
        </div>
        
        ${v2State.prediction ? `
            <div class="v2-prediction-card">
                <div class="v2-prediction-label">🔮 Predicted Next:</div>
                <div class="v2-prediction-exercise">${v2State.prediction.exercise}</div>
                <div class="v2-prediction-reason">${v2State.prediction.reason}</div>
                <button class="btn btn-primary btn-sm" onclick="v2AcceptPrediction()">
                    ✓ Yes, Log It
                </button>
                <button class="btn btn-ghost btn-sm" onclick="v2DismissPrediction()">
                    Different Exercise
                </button>
            </div>
        ` : ''}
        
        <div class="v2-quick-input">
            <input type="text" id="v2ExerciseInput" class="form-input" 
                placeholder="Type exercise (e.g., 'FB BB 135x10' or 'bench press 185 8')"
                onkeypress="if(event.key==='Enter') v2ParseAndAddExercise()">
            <button class="btn btn-primary" onclick="v2ParseAndAddExercise()">
                Add
            </button>
        </div>
        
        <div class="v2-workout-footer">
            <div class="v2-workout-stats">
                <span>${workout.summary?.total_exercises || 0} exercises</span>
                <span>•</span>
                <span>${workout.summary?.total_sets || 0} sets</span>
                <span>•</span>
                <span>${(workout.summary?.total_volume || 0).toLocaleString()} lbs</span>
            </div>
            <button class="btn btn-primary" onclick="v2ShowFinalizeModal()">
                ✅ Finalize Workout
            </button>
        </div>
    `;
}

function getCategoryEmoji(category) {
    const emojis = {
        chest: '🫁',
        back: '🔙',
        shoulders: '🎯',
        arms: '💪',
        legs: '🦵',
        core: '🧘',
        other: '🏋️'
    };
    return emojis[category] || '🏋️';
}

function updatePredictionUI() {
    // Prediction is rendered as part of updateV2WorkoutUI
    updateV2WorkoutUI();
}

function updateV2NutritionUI() {
    const panel = document.getElementById('v2NutritionPanel');
    if (!panel || !v2State.todayNutrition) return;
    
    const nutrition = v2State.todayNutrition;
    const totals = nutrition.totals || { calories: 0, protein: 0, carbs: 0, fat: 0 };
    const water = nutrition.water || { logged_oz: 0, target_oz: 128 };
    const meals = nutrition.meals || {};
    
    const mealCategories = [
        { key: 'coffee', label: '☕ Coffee', icon: '☕' },
        { key: 'breakfast', label: '🍳 Breakfast', icon: '🍳' },
        { key: 'snack_am', label: '🍎 Morning Snack', icon: '🍎' },
        { key: 'lunch', label: '🥪 Lunch', icon: '🥪' },
        { key: 'snack_pm', label: '🍪 Afternoon Snack', icon: '🍪' },
        { key: 'dinner', label: '🍽️ Dinner', icon: '🍽️' },
        { key: 'shakes', label: '🥤 Shakes', icon: '🥤' },
        { key: 'supplements', label: '💊 Supplements', icon: '💊' }
    ];
    
    let mealsHTML = mealCategories.map(cat => {
        const items = meals[cat.key] || [];
        if (items.length === 0) return '';
        
        return `
            <div class="v2-meal-category">
                <div class="v2-meal-header">${cat.label}</div>
                ${items.map(item => `
                    <div class="v2-food-item" data-id="${item.id}">
                        <div class="v2-food-name">${item.name}</div>
                        <div class="v2-food-macros">
                            <span>${item.calories} cal</span>
                            <span>${item.protein}g P</span>
                        </div>
                        <div class="v2-food-actions">
                            <button class="btn-icon-sm" onclick="v2EditFood('${item.id}')">✏️</button>
                            <button class="btn-icon-sm" onclick="v2DeleteFood('${item.id}')">🗑️</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }).filter(Boolean).join('');
    
    const waterPercent = Math.min(100, (water.logged_oz / water.target_oz) * 100);
    
    panel.innerHTML = `
        <div class="v2-nutrition-header">
            <div class="v2-nutrition-title">🍽️ Today's Nutrition</div>
        </div>
        
        <div class="v2-nutrition-totals">
            <div class="v2-macro-card calories">
                <div class="v2-macro-value">${totals.calories}</div>
                <div class="v2-macro-label">Calories</div>
            </div>
            <div class="v2-macro-card protein">
                <div class="v2-macro-value">${totals.protein}g</div>
                <div class="v2-macro-label">Protein</div>
            </div>
            <div class="v2-macro-card carbs">
                <div class="v2-macro-value">${totals.carbs}g</div>
                <div class="v2-macro-label">Carbs</div>
            </div>
            <div class="v2-macro-card fat">
                <div class="v2-macro-value">${totals.fat}g</div>
                <div class="v2-macro-label">Fat</div>
            </div>
        </div>
        
        <div class="v2-water-tracker">
            <div class="v2-water-header">
                <span>💧 Water</span>
                <span>${water.logged_oz} / ${water.target_oz} oz</span>
            </div>
            <div class="v2-water-bar">
                <div class="v2-water-fill" style="width: ${waterPercent}%"></div>
            </div>
            <div class="v2-water-buttons">
                <button class="btn btn-ghost btn-sm" onclick="v2LogWater(8)">+8 oz</button>
                <button class="btn btn-ghost btn-sm" onclick="v2LogWater(16)">+16 oz</button>
                <button class="btn btn-ghost btn-sm" onclick="v2LogWater(24)">+24 oz</button>
            </div>
        </div>
        
        <div class="v2-meals-container">
            ${mealsHTML || '<div class="v2-empty">No meals logged yet today</div>'}
        </div>
    `;
}

// ═══════════════════════════════════════════════════════════════
// UI ACTIONS
// ═══════════════════════════════════════════════════════════════

async function v2ParseAndAddExercise() {
    const input = document.getElementById('v2ExerciseInput');
    if (!input || !input.value.trim()) return;
    
    const parsed = await v2ParseExercise(input.value.trim());
    
    if (parsed && parsed.standard_name) {
        await v2AddExercise(
            parsed.standard_name,
            input.value.trim(),
            parsed.weight || 0,
            parsed.reps || 0
        );
        input.value = '';
    } else if (parsed && !parsed.standard_name) {
        // Couldn't parse - show manual input modal
        showToast('❓ Could not parse. Try: "bench press 135x10"');
    }
}

async function v2QuickAddSet(exerciseId, exerciseName) {
    const exercise = v2State.activeWorkout.exercises.find(e => e.id === exerciseId);
    if (!exercise) return;
    
    const lastSet = exercise.sets[exercise.sets.length - 1];
    await v2AddExercise(exerciseName, exerciseName, lastSet.weight, lastSet.reps);
}

async function v2AcceptPrediction() {
    if (!v2State.prediction) return;
    
    document.getElementById('v2ExerciseInput').value = v2State.prediction.exercise;
    document.getElementById('v2ExerciseInput').focus();
}

function v2DismissPrediction() {
    v2State.prediction = null;
    updateV2WorkoutUI();
}

function v2ShowFinalizeModal() {
    const workout = v2State.activeWorkout;
    if (!workout) return;
    
    const modalHTML = `
        <div class="modal-overlay" id="v2FinalizeModal" onclick="if(event.target===this) this.remove()">
            <div class="modal-content" style="max-width: 400px;">
                <h2 style="margin-bottom: 16px;">✅ Finalize Workout</h2>
                
                <div class="form-group">
                    <label class="form-label">Workout Name</label>
                    <input type="text" id="v2WorkoutName" class="form-input" 
                        value="${workout.workout_name || ''}" 
                        placeholder="Push Day, Leg Day, etc.">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Notes (optional)</label>
                    <textarea id="v2WorkoutNotes" class="form-input" rows="3" 
                        placeholder="How did it feel? Any PRs?"></textarea>
                </div>
                
                <div style="margin: 16px 0; padding: 12px; background: var(--onyx); border-radius: 8px;">
                    <div style="font-size: 14px; color: var(--white-50);">Summary</div>
                    <div style="margin-top: 8px;">
                        <strong>${workout.summary?.total_exercises || 0}</strong> exercises • 
                        <strong>${workout.summary?.total_sets || 0}</strong> sets • 
                        <strong>${(workout.summary?.total_volume || 0).toLocaleString()}</strong> lbs
                    </div>
                </div>
                
                <div style="display: flex; gap: 12px;">
                    <button class="btn btn-ghost" onclick="document.getElementById('v2FinalizeModal').remove()">
                        Cancel
                    </button>
                    <button class="btn btn-primary" style="flex: 1;" onclick="v2DoFinalize()">
                        ✅ Complete Workout
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

async function v2DoFinalize() {
    const name = document.getElementById('v2WorkoutName')?.value;
    const notes = document.getElementById('v2WorkoutNotes')?.value;
    
    await v2FinalizeWorkout(name, notes);
    document.getElementById('v2FinalizeModal')?.remove();
}

function v2EditExercise(exerciseId) {
    // TODO: Implement edit modal
    showToast('Edit coming soon!');
}

function v2EditFood(foodId) {
    // TODO: Implement edit modal
    showToast('Edit coming soon!');
}

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

async function initV2() {
    console.log('🚀 Initializing MACRA v2.0...');
    
    // Check if logged in
    const token = localStorage.getItem('macra_token');
    if (!token) {
        console.log('No token, skipping v2 init');
        return;
    }
    
    try {
        // Load active workout
        await v2GetActiveWorkout();
        
        // Load today's nutrition
        await v2GetTodayNutrition();
        
        // Get prediction if workout active
        if (v2State.activeWorkout) {
            await v2GetPrediction();
        }
        
        // Update UI
        updateV2WorkoutUI();
        updateV2NutritionUI();
        
        console.log('✅ MACRA v2.0 initialized');
    } catch (e) {
        console.error('V2 init error:', e);
    }
}

// Add v2 CSS styles
function addV2Styles() {
    const styles = `
        .v2-workout-header {
            padding: 16px;
            background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.2));
            border-radius: 12px;
            margin-bottom: 16px;
        }
        .v2-workout-status {
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 1px;
            animation: pulse 2s infinite;
        }
        .v2-workout-timer {
            float: right;
            font-family: var(--font-display);
        }
        .v2-workout-name {
            font-size: 20px;
            font-weight: 600;
            margin-top: 8px;
        }
        .v2-exercise-card {
            background: var(--onyx);
            border: 1px solid var(--white-10);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 12px;
        }
        .v2-exercise-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .v2-exercise-name {
            font-weight: 600;
            font-size: 16px;
        }
        .v2-exercise-actions {
            display: flex;
            gap: 8px;
        }
        .v2-sets-list {
            margin-bottom: 12px;
        }
        .v2-set-row {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px 12px;
            background: var(--carbon);
            border-radius: 8px;
            margin-bottom: 6px;
            font-size: 14px;
        }
        .v2-set-num {
            color: var(--white-50);
            min-width: 50px;
        }
        .v2-set-weight {
            color: var(--prism-cyan);
            font-weight: 600;
        }
        .v2-set-reps {
            color: var(--prism-violet);
        }
        .v2-set-rpe {
            color: var(--prism-amber);
            font-size: 12px;
        }
        .v2-prediction-card {
            background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(6, 182, 212, 0.1));
            border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 12px;
            padding: 16px;
            margin: 16px 0;
        }
        .v2-prediction-label {
            font-size: 12px;
            color: var(--prism-emerald);
            margin-bottom: 4px;
        }
        .v2-prediction-exercise {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .v2-prediction-reason {
            font-size: 12px;
            color: var(--white-50);
            margin-bottom: 12px;
        }
        .v2-quick-input {
            display: flex;
            gap: 12px;
            margin: 16px 0;
        }
        .v2-quick-input input {
            flex: 1;
        }
        .v2-workout-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-top: 16px;
            border-top: 1px solid var(--white-10);
            margin-top: 16px;
        }
        .v2-workout-stats {
            font-size: 14px;
            color: var(--white-50);
            display: flex;
            gap: 8px;
        }
        .v2-nutrition-totals {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 16px;
        }
        .v2-macro-card {
            background: var(--onyx);
            border-radius: 12px;
            padding: 12px;
            text-align: center;
        }
        .v2-macro-value {
            font-size: 20px;
            font-weight: 700;
            font-family: var(--font-display);
        }
        .v2-macro-card.calories .v2-macro-value { color: var(--prism-cyan); }
        .v2-macro-card.protein .v2-macro-value { color: var(--prism-rose); }
        .v2-macro-card.carbs .v2-macro-value { color: var(--prism-amber); }
        .v2-macro-card.fat .v2-macro-value { color: var(--prism-violet); }
        .v2-macro-label {
            font-size: 11px;
            color: var(--white-50);
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .v2-water-tracker {
            background: var(--onyx);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 16px;
        }
        .v2-water-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
        }
        .v2-water-bar {
            height: 8px;
            background: var(--carbon);
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 12px;
        }
        .v2-water-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--prism-cyan), var(--prism-blue));
            border-radius: 4px;
            transition: width 0.3s ease;
        }
        .v2-water-buttons {
            display: flex;
            gap: 8px;
        }
        .v2-meal-category {
            margin-bottom: 16px;
        }
        .v2-meal-header {
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--white-70);
        }
        .v2-food-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            background: var(--onyx);
            border-radius: 8px;
            margin-bottom: 6px;
        }
        .v2-food-name {
            flex: 1;
            font-size: 14px;
        }
        .v2-food-macros {
            font-size: 12px;
            color: var(--white-50);
            display: flex;
            gap: 8px;
        }
        .v2-food-actions {
            display: flex;
            gap: 4px;
        }
        .btn-icon {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 16px;
            padding: 4px;
            opacity: 0.6;
            transition: opacity 0.2s;
        }
        .btn-icon:hover {
            opacity: 1;
        }
        .btn-icon-sm {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 12px;
            padding: 2px 6px;
            opacity: 0.5;
            transition: opacity 0.2s;
        }
        .btn-icon-sm:hover {
            opacity: 1;
        }
        .v2-empty {
            text-align: center;
            padding: 24px;
            color: var(--white-30);
        }
        @media (max-width: 600px) {
            .v2-nutrition-totals {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    `;
    
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        addV2Styles();
        // Delay init to allow main app to load
        setTimeout(initV2, 1000);
    });
} else {
    addV2Styles();
    setTimeout(initV2, 1000);
}

console.log('📦 MACRA v2.0 module loaded');
