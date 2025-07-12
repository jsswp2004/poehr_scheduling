import { renderHook, act } from '@testing-library/react';
import { useLogin } from '../login/useLogin';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { toast } from '../../components/SimpleToast';

// Mock dependencies
const mockNavigate = jest.fn();
const mockSearchParams = new URLSearchParams();

jest.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
    useSearchParams: () => [mockSearchParams],
}));

jest.mock('axios');
jest.mock('jwt-decode');
jest.mock('../../components/SimpleToast');
jest.mock('../../utils/events');
jest.mock('../../utils/tokenManager');
jest.mock('../../config/api', () => ({
    API_BASE_URL: 'http://localhost:8000',
}));

const mockedAxios = axios;

describe('useLogin Hook', () => {
    const mockNavigate = jest.fn();
    const mockToast = {
        success: jest.fn(),
        error: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        toast.mockReturnValue(mockToast);
    });

    describe('Initial State', () => {
        it('should initialize with empty form data', () => {
            const { result } = renderHook(() => useLogin());

            expect(result.current.formData).toEqual({
                username: '',
                password: ''
            });
            expect(result.current.loading).toBe(false);
        });

        it('should check for logout message on mount', () => {
            // Mock sessionStorage
            const getItemSpy = jest.spyOn(Storage.prototype, 'getItem');
            const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');

            getItemSpy.mockReturnValue('true');

            renderHook(() => useLogin());

            expect(getItemSpy).toHaveBeenCalledWith('just_logged_out');
            expect(removeItemSpy).toHaveBeenCalledWith('just_logged_out');
        });
    });

    describe('Form Data Management', () => {
        it('should update form data correctly', () => {
            const { result } = renderHook(() => useLogin());

            act(() => {
                result.current.handleInputChange({
                    target: { name: 'username', value: 'testuser' }
                });
            });

            expect(result.current.formData.username).toBe('testuser');
            expect(result.current.formData.password).toBe('');
        });

        it('should handle password field updates', () => {
            const { result } = renderHook(() => useLogin());

            act(() => {
                result.current.handleInputChange({
                    target: { name: 'password', value: 'testpass' }
                });
            });

            expect(result.current.formData.password).toBe('testpass');
            expect(result.current.formData.username).toBe('');
        });

        it('should update multiple fields independently', () => {
            const { result } = renderHook(() => useLogin());

            act(() => {
                result.current.handleInputChange({
                    target: { name: 'username', value: 'testuser' }
                });
            });

            act(() => {
                result.current.handleInputChange({
                    target: { name: 'password', value: 'testpass' }
                });
            });

            expect(result.current.formData).toEqual({
                username: 'testuser',
                password: 'testpass'
            });
        });
    });

    describe('Login Process', () => {
        it('should handle successful login', async () => {
            const mockToken = 'mock.jwt.token';
            const mockDecodedToken = {
                user_id: 1,
                username: 'testuser',
                is_admin: false,
                exp: Date.now() / 1000 + 3600
            };

            mockedAxios.post.mockResolvedValue({
                data: { access: mockToken }
            });
            jwtDecode.mockReturnValue(mockDecodedToken);

            const { result } = renderHook(() => useLogin());

            // Set form data
            act(() => {
                result.current.handleInputChange({
                    target: { name: 'username', value: 'testuser' }
                });
                result.current.handleInputChange({
                    target: { name: 'password', value: 'testpass' }
                });
            });

            // Perform login
            await act(async () => {
                await result.current.handleLogin({
                    preventDefault: jest.fn()
                });
            });

            expect(mockedAxios.post).toHaveBeenCalledWith(
                'http://localhost:8000/api/auth/login/',
                { username: 'testuser', password: 'testpass' }
            );
            expect(result.current.loading).toBe(false);
        });

        it('should handle login failure', async () => {
            mockedAxios.post.mockRejectedValue({
                response: {
                    data: { message: 'Invalid credentials' }
                }
            });

            const { result } = renderHook(() => useLogin());

            // Set form data
            act(() => {
                result.current.handleInputChange({
                    target: { name: 'username', value: 'wronguser' }
                });
                result.current.handleInputChange({
                    target: { name: 'password', value: 'wrongpass' }
                });
            });

            // Perform login
            await act(async () => {
                await result.current.handleLogin({
                    preventDefault: jest.fn()
                });
            });

            expect(result.current.loading).toBe(false);
            expect(mockToast.error).toHaveBeenCalledWith('Invalid credentials');
        });

        it('should set loading state during login', async () => {
            // Create a promise we can control
            let resolveLogin;
            const loginPromise = new Promise((resolve) => {
                resolveLogin = resolve;
            });

            mockedAxios.post.mockReturnValue(loginPromise);

            const { result } = renderHook(() => useLogin());

            // Start login
            act(() => {
                result.current.handleLogin({
                    preventDefault: jest.fn()
                });
            });

            // Should be loading
            expect(result.current.loading).toBe(true);

            // Complete login
            await act(async () => {
                resolveLogin({ data: { access: 'token' } });
                await loginPromise;
            });

            expect(result.current.loading).toBe(false);
        });

        it('should handle network errors', async () => {
            mockedAxios.post.mockRejectedValue(new Error('Network error'));

            const { result } = renderHook(() => useLogin());

            await act(async () => {
                await result.current.handleLogin({
                    preventDefault: jest.fn()
                });
            });

            expect(mockToast.error).toHaveBeenCalledWith('Network error. Please try again.');
        });
    });

    describe('Return Values', () => {
        it('should return all required properties and methods', () => {
            const { result } = renderHook(() => useLogin());

            expect(result.current).toHaveProperty('formData');
            expect(result.current).toHaveProperty('loading');
            expect(result.current).toHaveProperty('handleInputChange');
            expect(result.current).toHaveProperty('handleLogin');
            expect(typeof result.current.handleInputChange).toBe('function');
            expect(typeof result.current.handleLogin).toBe('function');
        });
    });
});
