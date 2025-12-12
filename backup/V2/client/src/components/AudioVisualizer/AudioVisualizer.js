import React, { useRef, useEffect, useState } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';

const VisualizerContainer = styled.div`
  width: ${props => props.size || '200px'};
  height: ${props => props.size || '200px'};
  border-radius: 50%;
  background: ${props => props.theme.colors.background};
  border: 2px solid ${props => props.theme.colors.border};
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
`;

const AudioLevel = styled(motion.div)`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 50%;
  background: ${props => props.theme.colors.accent};
  opacity: ${props => props.level || 0};
  transition: opacity 0.1s ease;
`;

const AudioBars = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: end;
  gap: 2px;
  height: 60px;
`;

const AudioBar = styled(motion.div)`
  width: 3px;
  background: ${props => props.theme.colors.accent};
  border-radius: 2px;
  min-height: 4px;
`;

const CenterIcon = styled.div`
  font-size: ${props => props.size === 'large' ? '4rem' : '2rem'};
  color: ${props => props.theme.colors.accent};
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const PulseRing = styled(motion.div)`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border: 2px solid ${props => props.theme.colors.accent};
  border-radius: 50%;
  opacity: 0;
`;

const AudioVisualizer = ({ 
  audioLevel = 0, 
  isSpeaking = false, 
  isMuted = false, 
  size = '200px',
  showBars = true,
  showPulse = true,
  color = null 
}) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const [bars, setBars] = useState(Array(12).fill(0));

  // Generate random bar heights for visualization
  useEffect(() => {
    if (!showBars) return;

    const interval = setInterval(() => {
      if (isSpeaking) {
        setBars(prev => prev.map(() => Math.random() * audioLevel));
      } else {
        setBars(prev => prev.map(bar => Math.max(0, bar - 0.1)));
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isSpeaking, audioLevel, showBars]);

  // Canvas-based visualization
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 10;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (isSpeaking && showBars) {
        // Draw audio bars
        const barCount = 32;
        const barWidth = (2 * Math.PI * radius) / barCount;
        
        for (let i = 0; i < barCount; i++) {
          const angle = (i / barCount) * 2 * Math.PI;
          const barHeight = (Math.random() * audioLevel * 20) + 5;
          
          ctx.save();
          ctx.translate(centerX, centerY);
          ctx.rotate(angle);
          ctx.fillStyle = color || '#00d4aa';
          ctx.fillRect(0, -barHeight, barWidth * 0.8, barHeight);
          ctx.restore();
        }
      }
    };

    if (isSpeaking) {
      animationRef.current = requestAnimationFrame(draw);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isSpeaking, audioLevel, color]);

  return (
    <VisualizerContainer size={size}>
      {/* Canvas for advanced visualization */}
      <canvas
        ref={canvasRef}
        width={200}
        height={200}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          borderRadius: '50%',
        }}
      />
      
      {/* Audio level overlay */}
      <AudioLevel
        level={isSpeaking ? audioLevel : 0}
        style={{
          background: color || undefined,
        }}
      />
      
      {/* Pulse rings */}
      {showPulse && isSpeaking && (
        <>
          <PulseRing
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.6, 0, 0.6],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{
              width: '80%',
              height: '80%',
              borderColor: color || undefined,
            }}
          />
          <PulseRing
            animate={{
              scale: [1, 1.4, 1],
              opacity: [0.4, 0, 0.4],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 0.5,
            }}
            style={{
              width: '60%',
              height: '60%',
              borderColor: color || undefined,
            }}
          />
        </>
      )}
      
      {/* Audio bars */}
      {showBars && (
        <AudioBars>
          {bars.map((height, index) => (
            <AudioBar
              key={index}
              animate={{
                height: `${Math.max(4, height * 60)}px`,
              }}
              transition={{
                duration: 0.1,
                ease: 'easeOut',
              }}
              style={{
                background: color || undefined,
              }}
            />
          ))}
        </AudioBars>
      )}
      
      {/* Center icon */}
      <CenterIcon size={size === '200px' ? 'large' : 'normal'}>
        {isMuted ? '🔇' : isSpeaking ? '🎤' : '🎧'}
      </CenterIcon>
    </VisualizerContainer>
  );
};

export default AudioVisualizer;
