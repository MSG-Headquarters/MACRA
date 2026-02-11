/* ═══════════════════════════════════════════════════════════════════════════════
   
   MACRA CRYPTO v1.0
   ════════════════════════════════════════════════════════════════════════════════
   
   Client-side encryption using the athlete's code as the encryption key.
   Uses Web Crypto API (built into all modern browsers).
   
   HYBRID APPROACH:
   ─────────────────
   ENCRYPTED (Private):
   - Weight history
   - Detailed nutrition logs  
   - Personal goals
   - Activity details
   - Notes and personal data
   
   PLAINTEXT (Public/Social):
   - Display name
   - Streak count
   - Total workouts
   - PR records (for leaderboards)
   - Points
   - Avatar/emoji
   
   SECURITY MODEL:
   ─────────────────
   1. Athlete code is NEVER sent to server
   2. Encryption key is derived from: athleteCode + salt (PBKDF2)
   3. Data is encrypted with AES-GCM before sync
   4. If user loses athlete code, private data is UNRECOVERABLE
   
   ═══════════════════════════════════════════════════════════════════════════════ */

const MACRA_CRYPTO = {
    
    version: '1.0.0',
    algorithm: 'AES-GCM',
    keyLength: 256,
    iterations: 100000, // PBKDF2 iterations
    
    // ═══════════════════════════════════════════════════════════════════════════
    // KEY MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Generate a new athlete code
     * Format: MACRA-XXXX-XXXX (12 chars of entropy)
     */
    generateAthleteCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars (0/O, 1/I/L)
        let code = 'MACRA-';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        code += '-';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    },
    
    /**
     * Derive an encryption key from the athlete code
     * Uses PBKDF2 with a fixed salt (user-specific salt could be stored in Supabase)
     */
    async deriveKey(athleteCode, salt = null) {
        // Use a default salt if none provided (in production, store per-user salt in DB)
        const saltBytes = salt || new TextEncoder().encode('MACRA-SALT-V1-' + athleteCode.substring(0, 10));
        
        // Import the athlete code as key material
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(athleteCode),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        
        // Derive the actual encryption key
        const key = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBytes,
                iterations: this.iterations,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: this.algorithm, length: this.keyLength },
            false,
            ['encrypt', 'decrypt']
        );
        
        return key;
    },
    
    // ═══════════════════════════════════════════════════════════════════════════
    // ENCRYPTION / DECRYPTION
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Encrypt data using the athlete code
     * Returns base64-encoded string with IV prepended
     */
    async encrypt(data, athleteCode) {
        try {
            const key = await this.deriveKey(athleteCode);
            
            // Generate random IV for each encryption
            const iv = crypto.getRandomValues(new Uint8Array(12));
            
            // Convert data to JSON string then to bytes
            const dataBytes = new TextEncoder().encode(JSON.stringify(data));
            
            // Encrypt
            const encryptedBytes = await crypto.subtle.encrypt(
                { name: this.algorithm, iv: iv },
                key,
                dataBytes
            );
            
            // Combine IV + encrypted data
            const combined = new Uint8Array(iv.length + encryptedBytes.byteLength);
            combined.set(iv);
            combined.set(new Uint8Array(encryptedBytes), iv.length);
            
            // Return as base64
            return btoa(String.fromCharCode(...combined));
        } catch (error) {
            console.error('MACRA Crypto: Encryption failed', error);
            throw new Error('Encryption failed');
        }
    },
    
    /**
     * Decrypt data using the athlete code
     * Expects base64-encoded string with IV prepended
     */
    async decrypt(encryptedBase64, athleteCode) {
        try {
            const key = await this.deriveKey(athleteCode);
            
            // Decode base64
            const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
            
            // Extract IV (first 12 bytes) and encrypted data
            const iv = combined.slice(0, 12);
            const encryptedBytes = combined.slice(12);
            
            // Decrypt
            const decryptedBytes = await crypto.subtle.decrypt(
                { name: this.algorithm, iv: iv },
                key,
                encryptedBytes
            );
            
            // Convert bytes back to JSON
            const jsonString = new TextDecoder().decode(decryptedBytes);
            return JSON.parse(jsonString);
        } catch (error) {
            console.error('MACRA Crypto: Decryption failed', error);
            throw new Error('Decryption failed - invalid athlete code or corrupted data');
        }
    },
    
    // ═══════════════════════════════════════════════════════════════════════════
    // HYBRID DATA HANDLING
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Fields that should be encrypted (private data)
     */
    privateFields: [
        'weightHistory',
        'nutritionDetails',
        'personalGoals',
        'activityDetails',
        'notes',
        'bodyMeasurements'
    ],
    
    /**
     * Fields that stay plaintext (public/social data)
     */
    publicFields: [
        'displayName',
        'streak',
        'totalWorkouts',
        'totalVolume',
        'prs',
        'points',
        'avatar',
        'badges',
        'weeklyStats'
    ],
    
    /**
     * Prepare data for sync - encrypt private fields, keep public fields plaintext
     */
    async prepareForSync(appData, athleteCode) {
        const syncData = {
            // Public data (plaintext)
            public: {
                displayName: appData.profile?.name || 'Athlete',
                streak: appData.stats?.streak || 0,
                longestStreak: appData.stats?.longestStreak || 0,
                totalWorkouts: appData.stats?.totalWorkouts || 0,
                totalVolume: appData.stats?.totalVolume || 0,
                points: appData.stats?.points || 0,
                weeklyPoints: appData.stats?.weeklyPoints || 0,
                prs: appData.prs || {},
                badges: appData.badges || [],
                lastActive: new Date().toISOString()
            },
            
            // Private data (will be encrypted)
            private_encrypted: null,
            
            // Metadata
            encryption_version: this.version,
            encrypted_at: new Date().toISOString()
        };
        
        // Gather private data
        const privateData = {
            weightHistory: appData.weightHistory || [],
            goals: appData.goals || {},
            activities: appData.activities || {},
            profile: appData.profile || {},
            friends: appData.friends || [],
            notes: appData.notes || []
        };
        
        // Encrypt private data
        syncData.private_encrypted = await this.encrypt(privateData, athleteCode);
        
        return syncData;
    },
    
    /**
     * Process data after loading from server - decrypt private fields
     */
    async processFromSync(syncData, athleteCode) {
        const appData = {
            // Start with public data
            profile: { name: syncData.public?.displayName || 'Athlete' },
            stats: {
                streak: syncData.public?.streak || 0,
                longestStreak: syncData.public?.longestStreak || 0,
                totalWorkouts: syncData.public?.totalWorkouts || 0,
                totalVolume: syncData.public?.totalVolume || 0,
                points: syncData.public?.points || 0,
                weeklyPoints: syncData.public?.weeklyPoints || 0
            },
            prs: syncData.public?.prs || {},
            badges: syncData.public?.badges || []
        };
        
        // Decrypt private data if present
        if (syncData.private_encrypted) {
            try {
                const privateData = await this.decrypt(syncData.private_encrypted, athleteCode);
                
                // Merge private data
                appData.weightHistory = privateData.weightHistory || [];
                appData.goals = privateData.goals || {};
                appData.activities = privateData.activities || {};
                appData.profile = { ...appData.profile, ...privateData.profile };
                appData.friends = privateData.friends || [];
                appData.notes = privateData.notes || [];
            } catch (error) {
                console.error('Failed to decrypt private data:', error);
                // Return public data only if decryption fails
                appData.decryptionFailed = true;
            }
        }
        
        return appData;
    },
    
    // ═══════════════════════════════════════════════════════════════════════════
    // ATHLETE CODE STORAGE
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Securely store the athlete code locally
     * Note: This is stored in localStorage - user should back it up!
     */
    storeAthleteCode(athleteCode) {
        // Store with a simple obfuscation (not true security, just prevents casual viewing)
        const obfuscated = btoa(athleteCode + ':' + Date.now());
        localStorage.setItem('macra_athlete_key', obfuscated);
        
        // Also store a hash for verification without exposing the code
        this.storeCodeHash(athleteCode);
    },
    
    /**
     * Retrieve the stored athlete code
     */
    getStoredAthleteCode() {
        const obfuscated = localStorage.getItem('macra_athlete_key');
        if (!obfuscated) return null;
        
        try {
            const decoded = atob(obfuscated);
            return decoded.split(':')[0];
        } catch {
            return null;
        }
    },
    
    /**
     * Store a hash of the athlete code for verification
     */
    async storeCodeHash(athleteCode) {
        const hashBuffer = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(athleteCode + 'MACRA-VERIFY')
        );
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem('macra_code_hash', hashHex);
    },
    
    /**
     * Verify an athlete code matches the stored hash
     */
    async verifyAthleteCode(athleteCode) {
        const storedHash = localStorage.getItem('macra_code_hash');
        if (!storedHash) return false;
        
        const hashBuffer = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(athleteCode + 'MACRA-VERIFY')
        );
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        return hashHex === storedHash;
    },
    
    /**
     * Clear stored athlete code (logout/reset)
     */
    clearStoredCode() {
        localStorage.removeItem('macra_athlete_key');
        localStorage.removeItem('macra_code_hash');
    },
    
    // ═══════════════════════════════════════════════════════════════════════════
    // BACKUP / RECOVERY
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Generate a recovery phrase from the athlete code
     * User should write this down and store securely
     */
    generateRecoveryPhrase(athleteCode) {
        // Simple encoding - in production, use BIP39 word list
        const encoded = btoa(athleteCode);
        return `MACRA-RECOVERY: ${encoded}`;
    },
    
    /**
     * Recover athlete code from recovery phrase
     */
    recoverFromPhrase(phrase) {
        try {
            const encoded = phrase.replace('MACRA-RECOVERY: ', '').trim();
            return atob(encoded);
        } catch {
            throw new Error('Invalid recovery phrase');
        }
    },
    
    /**
     * Export athlete code as QR code data URL
     * Requires a QR library to be loaded
     */
    async exportAsQR(athleteCode) {
        // Return data that can be used with a QR library
        return {
            type: 'MACRA-ATHLETE-CODE',
            version: this.version,
            code: athleteCode,
            created: new Date().toISOString()
        };
    }
};

// Export for global access
window.MACRA_CRYPTO = MACRA_CRYPTO;

console.log('🔐 MACRA Crypto v' + MACRA_CRYPTO.version + ' loaded');
