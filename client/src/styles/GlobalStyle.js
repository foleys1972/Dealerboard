import styled, { createGlobalStyle } from 'styled-components';

export const theme = {
  colors: {
    // Dark theme colors - professional and modern
    primary: '#0a0a0f', // Deep dark blue-black
    secondary: '#151520', // Slightly lighter dark
    tertiary: '#1a1a2e', // Card/surface dark
    accent: '#06b6d4', // Cyan blue (from TradePulse gradient)
    accentSecondary: '#10b981', // Emerald green (from TradePulse gradient)
    accentHover: '#0891b2', // Darker cyan for hover
    success: '#10b981', // Emerald green
    warning: '#f59e0b', // Amber
    error: '#ef4444', // Red
    info: '#3b82f6', // Blue
    // Dark theme specific
    background: '#0a0a0f', // Main background
    surface: '#151520', // Card/surface background
    surfaceElevated: '#1a1a2e', // Elevated surfaces
    text: '#ffffff', // Primary text
    textSecondary: '#a0a0b0', // Secondary text
    textTertiary: '#6b6b7a', // Tertiary text
    border: '#2a2a3a', // Borders
    borderLight: '#3a3a4a', // Lighter borders
    shadow: 'rgba(0, 0, 0, 0.3)', // Shadows
    shadowGlow: 'rgba(6, 182, 212, 0.2)', // Accent glow
    gradient: 'linear-gradient(135deg, #06b6d4 0%, #10b981 100%)', // TradePulse gradient
    gradientSubtle: 'linear-gradient(180deg, rgba(6, 182, 212, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%)', // Subtle gradient
  },
  fonts: {
    primary: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    xxl: '3rem',
  },
  borderRadius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },
  shadows: {
    sm: '0 2px 4px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)',
    md: '0 4px 8px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.4)',
    lg: '0 8px 16px rgba(0, 0, 0, 0.6), 0 4px 8px rgba(0, 0, 0, 0.5)',
    xl: '0 12px 24px rgba(0, 0, 0, 0.7), 0 6px 12px rgba(0, 0, 0, 0.6)',
    glow: '0 0 20px rgba(6, 182, 212, 0.3), 0 0 40px rgba(6, 182, 212, 0.1)',
    glowSuccess: '0 0 20px rgba(16, 185, 129, 0.3), 0 0 40px rgba(16, 185, 129, 0.1)',
  },
  breakpoints: {
    sm: '576px',
    md: '768px',
    lg: '992px',
    xl: '1200px',
  },
};

export const GlobalStyle = createGlobalStyle`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html {
    font-size: 16px;
    scroll-behavior: smooth;
  }

  body {
    font-family: ${props => props.theme.fonts.primary};
    background-color: ${props => props.theme.colors.background};
    color: ${props => props.theme.colors.text};
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-weight: 400;
    letter-spacing: -0.01em;
  }

  #root {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* Scrollbar Styling */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: ${props => props.theme.colors.background};
  }

  ::-webkit-scrollbar-thumb {
    background: ${props => props.theme.colors.border};
    border-radius: ${props => props.theme.borderRadius.sm};
    border: 2px solid ${props => props.theme.colors.background};
  }

  ::-webkit-scrollbar-thumb:hover {
    background: ${props => props.theme.colors.borderLight};
  }

  /* Focus styles */
  *:focus {
    outline: 2px solid ${props => props.theme.colors.accent};
    outline-offset: 2px;
  }

  /* Button reset */
  button {
    border: none;
    background: none;
    cursor: pointer;
    font-family: inherit;
  }

  /* Input reset */
  input, textarea, select {
    font-family: inherit;
    font-size: inherit;
  }

  /* Link reset */
  a {
    color: inherit;
    text-decoration: none;
  }

  /* List reset */
  ul, ol {
    list-style: none;
  }

  /* Image */
  img {
    max-width: 100%;
    height: auto;
  }

  /* Audio element styling */
  audio {
    width: 100%;
    height: 40px;
  }

  /* Video element styling */
  video {
    width: 100%;
    height: auto;
    border-radius: ${props => props.theme.borderRadius.md};
  }

  /* Toast notifications */
  .toast {
    font-family: ${props => props.theme.fonts.primary};
  }

  /* PWA specific styles */
  @media (display-mode: standalone) {
    body {
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
    }
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    :root {
      --color-background: #1a1a1a;
      --color-surface: #2d2d2d;
      --color-text: #ffffff;
      --color-text-secondary: #b0b0b0;
    }
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    * {
      border-color: currentColor;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

export const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 ${props => props.theme.spacing.md};
`;

export const Card = styled.div`
  background: ${props => props.theme.colors.surface};
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.md};
  padding: ${props => props.theme.spacing.lg};
  border: 1px solid ${props => props.theme.colors.border};
  transition: all 0.3s ease;
  
  &:hover {
    border-color: ${props => props.theme.colors.borderLight};
    box-shadow: ${props => props.theme.shadows.lg};
    transform: translateY(-2px);
  }
`;

export const Button = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== 'variant'
})`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  padding: 0.18rem 0.35rem;
  border-radius: 6px;
  font-weight: 500;
  font-size: 0.65rem;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  border: 1px solid transparent;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    transform: translate(-50%, -50%);
    transition: width 0.6s, height 0.6s;
  }

  &:active::before {
    width: 300px;
    height: 300px;
  }

  ${props => {
    switch (props.variant) {
      case 'primary':
        return `
          background: ${props.theme.colors.surface};
          color: ${props.theme.colors.text};
          border-color: ${props.theme.colors.border};
          &:hover {
            background: ${props.theme.colors.surfaceElevated};
            border-color: ${props.theme.colors.borderLight};
            transform: translateY(-1px);
            box-shadow: ${props.theme.shadows.md};
          }
        `;
      case 'secondary':
        return `
          background: ${props.theme.colors.surface};
          color: ${props.theme.colors.text};
          border-color: ${props.theme.colors.border};
          &:hover {
            background: ${props.theme.colors.surfaceElevated};
            border-color: ${props.theme.colors.borderLight};
          }
        `;
      case 'accent':
        return `
          background: ${props.theme.colors.gradient};
          color: white;
          border: none;
          box-shadow: ${props.theme.shadows.glow};
          &:hover {
            opacity: 0.95;
            transform: translateY(-2px);
            box-shadow: ${props.theme.shadows.glow}, ${props.theme.shadows.lg};
          }
          &:active {
            transform: translateY(0);
          }
        `;
      case 'danger':
        return `
          background: ${props.theme.colors.error};
          color: white;
          border: none;
          &:hover {
            opacity: 0.9;
            transform: translateY(-1px);
            box-shadow: ${props.theme.shadows.md};
          }
        `;
      default:
        return `
          background: ${props.theme.colors.surface};
          color: ${props.theme.colors.text};
          border-color: ${props.theme.colors.border};
          &:hover {
            background: ${props.theme.colors.surfaceElevated};
            border-color: ${props.theme.colors.borderLight};
          }
        `;
    }
  }}

  ${props => {
    switch (props.size) {
      case 'sm':
        return `
          padding: ${props.theme.spacing.xs} ${props.theme.spacing.sm};
          font-size: 0.75rem;
        `;
      case 'lg':
        return `
          padding: ${props.theme.spacing.md} ${props.theme.spacing.lg};
          font-size: 1rem;
        `;
      default:
        return '';
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const Input = styled.input`
  width: 100%;
  padding: ${props => props.theme.spacing.sm} ${props => props.theme.spacing.md};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 0.875rem;
  transition: border-color 0.2s ease;

  &:focus {
    border-color: ${props => props.theme.colors.accent};
    outline: none;
  }

  &::placeholder {
    color: ${props => props.theme.colors.textSecondary};
  }
`;

export const TextArea = styled.textarea`
  width: 100%;
  padding: ${props => props.theme.spacing.sm} ${props => props.theme.spacing.md};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 0.875rem;
  font-family: inherit;
  resize: vertical;
  min-height: 100px;
  transition: border-color 0.2s ease;

  &:focus {
    border-color: ${props => props.theme.colors.accent};
    outline: none;
  }

  &::placeholder {
    color: ${props => props.theme.colors.textSecondary};
  }
`;

export const Select = styled.select`
  width: 100%;
  padding: ${props => props.theme.spacing.sm} ${props => props.theme.spacing.md};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 0.875rem;
  background: ${props => props.theme.colors.surface};
  cursor: pointer;
  transition: border-color 0.2s ease;

  &:focus {
    border-color: ${props => props.theme.colors.accent};
    outline: none;
  }
`;

export const Label = styled.label`
  display: block;
  font-weight: 500;
  font-size: 0.875rem;
  margin-bottom: ${props => props.theme.spacing.xs};
  color: ${props => props.theme.colors.text};
`;

export const FormGroup = styled.div`
  margin-bottom: ${props => props.theme.spacing.md};
`;

export const Grid = styled.div`
  display: grid;
  gap: ${props => props.theme.spacing.md};
  grid-template-columns: ${props => {
    switch (props.columns) {
      case 1:
        return '1fr';
      case 2:
        return 'repeat(2, 1fr)';
      case 3:
        return 'repeat(3, 1fr)';
      case 4:
        return 'repeat(4, 1fr)';
      default:
        return 'repeat(auto-fit, minmax(250px, 1fr))';
    }
  }};

  @media (max-width: ${props => props.theme.breakpoints.md}) {
    grid-template-columns: 1fr;
  }
`;

export const Flex = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing[props.$gap || props.gap] || props.theme.spacing.md};
  align-items: ${props => props.$align || props.align || 'center'};
  justify-content: ${props => props.$justify || props.justify || 'flex-start'};
  flex-direction: ${props => props.$direction || props.direction || 'row'};
  flex-wrap: ${props => props.$wrap || props.wrap || 'nowrap'};
`;

export const Spacer = styled.div`
  height: ${props => props.theme.spacing[props.size] || props.theme.spacing.md};
`;

export const Divider = styled.hr`
  border: none;
  height: 1px;
  background: ${props => props.theme.colors.border};
  margin: ${props => props.theme.spacing.lg} 0;
`;

export const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: ${props => props.theme.spacing.xs} ${props => props.theme.spacing.sm};
  border-radius: ${props => props.theme.borderRadius.sm};
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;

  ${({ $variant, theme }) => {
    switch ($variant) {
      case 'success':
        return `
          background: ${theme.colors.success};
          color: white;
        `;
      case 'warning':
        return `
          background: ${theme.colors.warning};
          color: white;
        `;
      case 'error':
        return `
          background: ${theme.colors.error};
          color: white;
        `;
      case 'info':
        return `
          background: ${theme.colors.info};
          color: white;
        `;
      default:
        return `
          background: ${theme.colors.border};
          color: ${theme.colors.text};
        `;
    }
  }}
`;

export const LoadingSpinner = styled.div`
  width: ${props => props.size || '24px'};
  height: ${props => props.size || '24px'};
  border: 2px solid ${props => props.theme.colors.border};
  border-top: 2px solid ${props => props.theme.colors.accent};
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

export const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: ${props => props.theme.spacing.md};
`;

export const ModalContent = styled.div`
  background: ${props => props.theme.colors.surface};
  border-radius: ${props => props.theme.borderRadius.lg};
  box-shadow: ${props => props.theme.shadows.xl};
  max-width: 500px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
`;

export const ModalHeader = styled.div`
  padding: ${props => props.theme.spacing.lg};
  border-bottom: 1px solid ${props => props.theme.colors.border};
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

export const ModalBody = styled.div`
  padding: ${props => props.theme.spacing.lg};
`;

export const ModalFooter = styled.div`
  padding: ${props => props.theme.spacing.lg};
  border-top: 1px solid ${props => props.theme.colors.border};
  display: flex;
  gap: ${props => props.theme.spacing.sm};
  justify-content: flex-end;
`;
