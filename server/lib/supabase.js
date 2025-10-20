"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.supabase = void 0;

const AsyncStorage = require("@react-native-async-storage/async-storage");
const supabase_js_1 = require("@supabase/supabase-js");
const react_native_1 = require("react-native");
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
// For testing environment, provide mock values
const isTestEnvironment = process.env.NODE_ENV === 'test';
console.log('Supabase Configuration Debug:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('isTestEnvironment:', isTestEnvironment);
console.log('EXPO_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'Present' : 'Missing');
console.log('EXPO_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Present' : 'Missing');
if (!isTestEnvironment) {
    // Validate environment variables only in non-test environments
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('Missing Supabase environment variables:');
        console.error('EXPO_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'Present' : 'Missing');
        console.error('EXPO_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Present' : 'Missing');
        console.error('Please create a .env file with your Supabase credentials');
        throw new Error('Supabase environment variables are required');
    }
}
// Cross-platform storage configuration
const getStorage = () => {
    if (react_native_1.Platform.OS === 'web') {
        // Web platform - use localStorage
        if (typeof window !== 'undefined') {
            try {
                // Test if localStorage is available and working
                const testKey = '__supabase_test__';
                window.localStorage.setItem(testKey, 'test');
                window.localStorage.removeItem(testKey);
                return window.localStorage;
            }
            catch (error) {
                console.warn('localStorage not available, using memory storage');
                return undefined;
            }
        }
        return undefined;
    }
    else {
        // Mobile platform - use AsyncStorage
        return AsyncStorage.default || AsyncStorage;
    }
};
// Create Supabase client with cross-platform configuration
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl || 'https://dummy.supabase.co', supabaseAnonKey || 'dummy-key', {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: react_native_1.Platform.OS === 'web',
        flowType: react_native_1.Platform.OS === 'web' ? 'pkce' : 'implicit',
        // Cross-platform storage configuration
        storage: getStorage(),
        storageKey: 'supabase.auth.token',
        // Enable debug only in development
        debug: process.env.NODE_ENV === 'development',
        // Optimize session handling
        onAuthStateChange: (event, session) => {
            console.log('Supabase auth state change:', event, session?.user?.id);
        },
    },
    // Optimize global configuration
    global: {
        headers: {
            'X-Client-Info': `notez-react-app-${react_native_1.Platform.OS}`,
        },
    },
    // Optimize realtime configuration
    realtime: {
        params: {
            eventsPerSecond: react_native_1.Platform.OS === 'web' ? 10 : 5, // Lower rate for mobile
        },
    },
    // Platform-specific optimizations
    ...(react_native_1.Platform.OS === 'web' && {
        // Web-specific optimizations
        fetch: (url, options = {}) => {
            // Add timeout for web requests
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            return fetch(url, {
                ...options,
                signal: controller.signal,
            }).finally(() => {
                clearTimeout(timeoutId);
            });
        },
    }),
});
// Database connection for Drizzle
exports.db = exports.supabase;
