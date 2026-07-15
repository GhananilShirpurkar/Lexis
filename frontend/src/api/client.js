import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach JWT token if it exists in localStorage
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('lexis_access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Handle errors globally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // If unauthorized, clear token and trigger redirect
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('lexis_access_token');
      // Dispatch custom event so AuthProvider can react immediately
      window.dispatchEvent(new Event('auth-unauthorized'));
    }
    return Promise.reject(error);
  }
);

export default apiClient;
