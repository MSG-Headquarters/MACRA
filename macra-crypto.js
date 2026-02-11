/**
 * MACRA CRYPTO v2.1
 * ══════════════════════════════════════════════════════════════
 * 
 * Client-side encryption using Athlete Codes as the encryption key.
 * Data is encrypted BEFORE leaving the device, ensuring end-to-end
 * security even if the backend is compromised.
 * 
 * SECURITY MODEL:
 * ────────────────
 * 1. Your Athlete Code (MACRA-XXXX) is the encryption key
 * 2. Data is encrypted on your device before sending to server
 * 3. Server stores encrypted blobs - cannot read your data
 * 4. Only you (or those with your code) can decrypt
 * 
 * @version 2.1.0
 * @author MSG Headquarters / Aurelius Koda
 */

(function(window) {
    'use strict';

    // Convert string to Uint8Array
    function str2ab(str) {
        const encoder = new TextEncoder();
        return encoder.encode(str);
    }

    // Convert Uint8Array to string
    function ab2str(buf) {
        const decoder = new TextDecoder();
        return decoder.decode(buf);
    }

    // Convert ArrayBuffer to base64
    function bufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // Convert base64 to ArrayBuffer
    function base64ToBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    // Derive encryption key from athlete code using PBKDF2
    async function deriveKey(athleteCode, salt) {
        const normalizedCode = athleteCode.toUpperCase().replace(/\s/g, '');
        
        const keyMaterial = await crypto.subtle.importKey(
            'raw', str2ab(normalizedCode), 'PBKDF2', false, ['deriveBits', 'deriveKey']
        );
        
        return await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    function generateSalt() { return crypto.getRandomValues(new Uint8Array(16)); }
    function generateIV() { return crypto.getRandomValues(new Uint8Array(12)); }

    // Encrypt data using athlete code
    async function encrypt(data, athleteCode) {
        if (!athleteCode) {
            console.warn('No athlete code provided, returning data unencrypted');
            return data;
        }
        
        try {
            const salt = generateSalt();
            const iv = generateIV();
            const key = await deriveKey(athleteCode, salt);
            const plaintext = JSON.stringify(data);
            
            const ciphertext = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv, tagLength: 128 },
                key,
                str2ab(plaintext)
            );
            
            return {
                _encrypted: true,
                version: '2.1',
                algorithm: 'AES-256-GCM',
                salt: bufferToBase64(salt),
                iv: bufferToBase64(iv),
                ciphertext: bufferToBase64(ciphertext),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Encryption error:', error);
            throw new Error('Failed to encrypt data');
        }
    }

    // Decrypt data using athlete code
    async function decrypt(payload, athleteCode) {
        if (!payload || !payload._encrypted) return payload;
        if (!athleteCode) throw new Error('Athlete code required for decryption');
        
        try {
            const salt = new Uint8Array(base64ToBuffer(payload.salt));
            const iv = new Uint8Array(base64ToBuffer(payload.iv));
            const ciphertext = base64ToBuffer(payload.ciphertext);
            const key = await deriveKey(athleteCode, salt);
            
            const plaintext = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv, tagLength: 128 },
                key,
                ciphertext
            );
            
            return JSON.parse(ab2str(plaintext));
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error('Failed to decrypt data - wrong athlete code?');
        }
    }

    function isSupported() {
        return !!(window.crypto && window.crypto.subtle && typeof window.crypto.subtle.encrypt === 'function');
    }

    function validateAthleteCode(code) {
        if (!code || typeof code !== 'string') return false;
        return /^MACRA-[A-Z0-9]{6}$/i.test(code);
    }

    // Expose to global scope
    window.macraEncrypt = encrypt;
    window.macraDecrypt = decrypt;

    window.MacraCryptoAPI = {
        encrypt, decrypt, deriveKey, isSupported, validateAthleteCode,
        version: '2.1.0',
        status: function() {
            return {
                supported: isSupported(),
                version: this.version,
                athleteCodeValid: validateAthleteCode(
                    JSON.parse(localStorage.getItem('macra_auth') || '{}').athleteCode
                )
            };
        }
    };

    if (isSupported()) {
        console.log('🔐 MACRA Crypto v2.1 initialized - Web Crypto API available');
    } else {
        console.warn('⚠️ MACRA Crypto: Web Crypto API not available');
    }

})(window);
