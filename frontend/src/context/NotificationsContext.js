import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { Toast, ToastContainer } from 'react-bootstrap';
import Icon from '../components/ui/Icon';
import { AuthContext } from './AuthContext';
import { useUserPreferences } from './UserPreferencesContext';

let notificationSeed = 0;

const NotificationsContext = createContext(null);

const VARIANT_ICON = {
  success: 'check',
  danger: 'warning',
  warning: 'warning',
  info: 'info',
};

const normalizeAudience = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value];
};

export const NotificationsProvider = ({ children }) => {
  const { user } = useContext(AuthContext) || {};
  const { notificationPrefs, markNotificationRead } = useUserPreferences();

  const [notifications, setNotifications] = useState([]);

  const currentUserId = user?.email || null;
  const currentRole = user?.role || 'user';

  const dismiss = useCallback((id) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
    markNotificationRead(id);
  }, [markNotificationRead]);

  const notify = useCallback((notification) => {
    notificationSeed += 1;
    const id = notification.id || `notif-${notificationSeed}`;
    const {
      title,
      description,
      variant = 'info',
      autoHide = true,
      delay = 4200,
      to,
      roles,
      audience = 'user',
    } = notification;

    const allowedUsers = normalizeAudience(to);
    const allowedRoles = normalizeAudience(roles);

    const isRoleMatch = allowedRoles.length === 0 || allowedRoles.includes(currentRole);

    const isUserMatch = (() => {
      if (audience === 'global') return true;
      if (audience === 'role') {
        return allowedRoles.length === 0 || allowedRoles.includes(currentRole);
      }
      if (audience === 'user') {
        if (!currentUserId) return false;
        if (allowedUsers.length === 0) return true;
        return allowedUsers.includes(currentUserId);
      }
      if (audience === 'custom') {
        if (!currentUserId) return false;
        return allowedUsers.includes(currentUserId);
      }
      return true;
    })();

    if (!isRoleMatch || !isUserMatch) {
      return null;
    }

    const dismissedSet = new Set(notificationPrefs.dismissed || []);
    if (dismissedSet.has(id)) {
      return null;
    }

    setNotifications((prev) => [
      ...prev,
      {
        id,
        title,
        description,
        variant,
        autoHide,
        delay,
      },
    ]);
    return id;
  }, [currentRole, currentUserId, notificationPrefs.dismissed]);

  const value = useMemo(() => ({
    notify,
    dismiss,
  }), [notify, dismiss]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <ToastContainer position="bottom-end" className="p-3">
        {notifications.map(({ id, title, description, variant, autoHide, delay }) => (
          <Toast
            key={id}
            onClose={() => dismiss(id)}
            bg={variant === 'info' ? undefined : variant}
            delay={delay}
            autohide={autoHide}
            className="shadow-sm"
          >
            <Toast.Header closeButton>
              <span className="me-2" aria-hidden="true">
                <Icon name={VARIANT_ICON[variant] || 'info'} size={16} />
              </span>
              <strong className="me-auto">{title}</strong>
            </Toast.Header>
            {description ? (
              <Toast.Body>{description}</Toast.Body>
            ) : null}
          </Toast>
        ))}
      </ToastContainer>
    </NotificationsContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return context;
};
