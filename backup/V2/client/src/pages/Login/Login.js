import React, { useState } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { FiMic, FiUser, FiLock, FiEye, FiEyeOff } from 'react-icons/fi';
import { useAuthStore } from '../../stores/authStore';
import { Button, Input, Card, FormGroup, Flex, Spacer } from '../../styles/GlobalStyle';
import toast from 'react-hot-toast';

const LoginContainer = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: ${props => props.theme.spacing.lg};
`;

const LoginCard = styled(Card)`
  width: 100%;
  max-width: 400px;
  background: ${props => props.theme.colors.surface};
  box-shadow: ${props => props.theme.shadows.xl};
`;

const LoginHeader = styled.div`
  text-align: center;
  margin-bottom: ${props => props.theme.spacing.xl};
`;

const Logo = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${props => props.theme.spacing.sm};
  font-size: 2rem;
  font-weight: 700;
  color: ${props => props.theme.colors.primary};
  margin-bottom: ${props => props.theme.spacing.sm};
`;

const Title = styled.h1`
  font-size: 1.5rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
`;

const Subtitle = styled.p`
  color: ${props => props.theme.colors.textSecondary};
  margin: ${props => props.theme.spacing.sm} 0 0;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.md};
`;

const InputGroup = styled.div`
  position: relative;
`;

const InputIcon = styled.div`
  position: absolute;
  left: ${props => props.theme.spacing.md};
  top: 50%;
  transform: translateY(-50%);
  color: ${props => props.theme.colors.textSecondary};
  font-size: 1.125rem;
`;

const StyledInput = styled(Input).withConfig({
  shouldForwardProp: (prop) => prop !== '$showPassword'
})`
  padding-left: 3rem;
  padding-right: ${props => props.$showPassword ? '3rem' : '1rem'};
`;

const PasswordToggle = styled.button`
  position: absolute;
  right: ${props => props.theme.spacing.md};
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: ${props => props.theme.colors.textSecondary};
  cursor: pointer;
  font-size: 1.125rem;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LoginButton = styled(Button)`
  width: 100%;
  padding: ${props => props.theme.spacing.md};
  font-size: 1rem;
  font-weight: 600;
  margin-top: ${props => props.theme.spacing.md};
`;

const LoginFooter = styled.div`
  text-align: center;
  margin-top: ${props => props.theme.spacing.lg};
  padding-top: ${props => props.theme.spacing.lg};
  border-top: 1px solid ${props => props.theme.colors.border};
`;

const FooterText = styled.p`
  color: ${props => props.theme.colors.textSecondary};
  font-size: 0.875rem;
  margin: 0;
`;

const ErrorMessage = styled.div`
  color: ${props => props.theme.colors.error};
  font-size: 0.875rem;
  margin-top: ${props => props.theme.spacing.sm};
  padding: ${props => props.theme.spacing.sm};
  background: ${props => props.theme.colors.error}10;
  border-radius: ${props => props.theme.borderRadius.sm};
  border: 1px solid ${props => props.theme.colors.error}30;
`;

const LoadingSpinner = styled.div`
  width: 20px;
  height: 20px;
  border: 2px solid transparent;
  border-top: 2px solid currentColor;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-right: ${props => props.theme.spacing.sm};

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const Login = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const { login } = useAuthStore();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.username || !formData.password) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await login(formData);
      
      if (result.success) {
        toast.success('Login successful!');
      } else {
        setError(result.error);
      }
    } catch (error) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setFormData({
      username: 'admin',
      password: 'admin',
    });
    
    setIsLoading(true);
    setError(null);

    try {
      const result = await login({
        username: 'admin',
        password: 'admin',
      });
      
      if (result.success) {
        toast.success('Demo login successful!');
      } else {
        setError(result.error);
      }
    } catch (error) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LoginContainer>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <LoginCard>
          <LoginHeader>
            <Logo>
              <FiMic />
              Trading Intercom
            </Logo>
            <Title>Welcome Back</Title>
            <Subtitle>Sign in to your trading intercom account</Subtitle>
          </LoginHeader>

          <Form onSubmit={handleSubmit}>
            <FormGroup>
              <InputGroup>
                <InputIcon>
                  <FiUser />
                </InputIcon>
                <StyledInput
                  type="text"
                  name="username"
                  placeholder="Username or Email"
                  value={formData.username}
                  onChange={handleInputChange}
                  disabled={isLoading}
                  required
                />
              </InputGroup>
            </FormGroup>

            <FormGroup>
              <InputGroup>
                <InputIcon>
                  <FiLock />
                </InputIcon>
                <StyledInput
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="Password"
                  value={formData.password}
                  onChange={handleInputChange}
                  disabled={isLoading}
                  $showPassword={showPassword}
                  required
                />
                <PasswordToggle
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </PasswordToggle>
              </InputGroup>
            </FormGroup>

            {error && (
              <ErrorMessage>
                {error}
              </ErrorMessage>
            )}

            <LoginButton
              type="submit"
              variant="primary"
              disabled={isLoading}
            >
              {isLoading && <LoadingSpinner />}
              {isLoading ? 'Signing In...' : 'Sign In'}
            </LoginButton>
          </Form>

          <LoginFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={handleDemoLogin}
              disabled={isLoading}
              style={{ width: '100%' }}
            >
              Try Admin Account
            </Button>
            <Spacer size="sm" />
            <FooterText>
              Secure trading communications with WebRTC audio<br/>
              <small>Admin: admin/admin | Trader: trader1/trader123</small>
            </FooterText>
          </LoginFooter>
        </LoginCard>
      </motion.div>
    </LoginContainer>
  );
};

export default Login;
