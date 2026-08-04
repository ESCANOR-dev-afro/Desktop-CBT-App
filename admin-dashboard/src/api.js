/**
 * api.js
 * 
 * Axios HTTP Client Instance for Admin Dashboard.
 * Connects to the local Node.js CBT backend on http://localhost:3000.
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api';

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json'
    }
});

export default api;
