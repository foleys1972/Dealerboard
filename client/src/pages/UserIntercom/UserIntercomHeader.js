import React from 'react';
import { FiSettings, FiLogOut } from 'react-icons/fi';
import { PRODUCT_NAME } from '../../config/brand';
import {
  Header,
  Logo,
  UserInfo,
  UserName,
  EmployeeId,
  IconButton,
  LogoutButton,
} from './UserIntercom.styles';

function PresenceBadge({ computePresence }) {
  const p = computePresence();
  const dotStyle = {
    width: 8,
    height: 8,
    borderRadius: '50%',
    marginLeft: 8,
    marginRight: 4,
    display: 'inline-block',
    background:
      p.key === 'online'
        ? '#10b981'
        : p.key === 'busy'
          ? '#ef4444'
          : p.key === 'forward'
            ? '#f59e0b'
            : 'rgba(255,255,255,0.35)',
  };

  return (
    <span
      title={p.label}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
    >
      <span style={dotStyle} />
      <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{p.label}</span>
    </span>
  );
}

export default function UserIntercomHeader({
  authUser,
  user,
  computePresence,
  onEditPage,
  onToggleSettings,
  onLogout,
}) {
  return (
    <Header>
      <Logo>
        <img
          src={`${process.env.PUBLIC_URL}/UC.ico`}
          alt={PRODUCT_NAME}
          style={{ width: 28, height: 28, marginRight: 10 }}
        />
        {PRODUCT_NAME}
      </Logo>
      <UserInfo>
        <UserName>
          {authUser?.username
            ? `@${authUser.username}`
            : authUser?.displayName || user.name}
        </UserName>
        <EmployeeId>
          {user.employeeId ? (
            <>
              ID: {user.employeeId}
              <PresenceBadge computePresence={computePresence} />
            </>
          ) : (
            <PresenceBadge computePresence={computePresence} />
          )}
        </EmployeeId>
        <IconButton onClick={onEditPage} title="Edit Page">
          ✏️
        </IconButton>
        <IconButton onClick={onToggleSettings} title="Quick Controls">
          <FiSettings />
        </IconButton>
        <LogoutButton onClick={onLogout} title="Logout">
          <FiLogOut />
          <span>Logout</span>
        </LogoutButton>
      </UserInfo>
    </Header>
  );
}
