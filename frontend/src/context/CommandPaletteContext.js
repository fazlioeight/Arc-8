import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const CommandPaletteContext = createContext(null);

export const CommandPaletteProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dynamicCommands, setDynamicCommands] = useState([]);

  const openPalette = useCallback(() => {
    setQuery('');
    setIsOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setIsOpen(false);
  }, []);

  const registerCommands = useCallback((commands = [], options = {}) => {
    const registrationId = options.id || options.ownerId || `cmd-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
    const normalize = (input, existing = []) => {
      if (typeof input === 'function') {
        return (input(existing) || []).filter(Boolean);
      }
      return (input || []).filter(Boolean);
    };

    setDynamicCommands((prev = []) => {
      const resolved = normalize(commands, prev);
      const withoutOwner = prev.filter((command) => command.__owner !== registrationId);
      const withoutDuplicates = withoutOwner.filter(
        (command) => !resolved.some((next) => next?.id && next.id === command.id),
      );
      const tagged = resolved.map((command) => ({
        ...command,
        __owner: registrationId,
      }));
      return [...withoutDuplicates, ...tagged];
    });

    return () => {
      setDynamicCommands((prev = []) => prev.filter((command) => command.__owner !== registrationId));
    };
  }, []);

  const unregisterCommandsById = useCallback((ids = []) => {
    const idSet = new Set(ids.filter(Boolean));
    if (!idSet.size) return;
    setDynamicCommands((prev = []) => prev.filter((command) => !idSet.has(command.id)));
  }, []);

  const value = useMemo(() => ({
    isOpen,
    openPalette,
    closePalette,
    query,
    setQuery,
    dynamicCommands,
    registerCommands,
    unregisterCommandsById,
  }), [isOpen, openPalette, closePalette, query, dynamicCommands, registerCommands, unregisterCommandsById]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  );
};

export const useCommandPalette = () => {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    return {
      isOpen: false,
      openPalette: () => {},
      closePalette: () => {},
      query: '',
      setQuery: () => {},
      dynamicCommands: [],
      registerCommands: () => () => {},
      unregisterCommandsById: () => {},
    };
  }
  return context;
};
