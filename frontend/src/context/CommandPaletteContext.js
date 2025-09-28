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

  const registerCommands = useCallback((commands = []) => {
    setDynamicCommands(commands);
  }, []);

  const value = useMemo(() => ({
    isOpen,
    openPalette,
    closePalette,
    query,
    setQuery,
    dynamicCommands,
    registerCommands,
  }), [isOpen, openPalette, closePalette, query, dynamicCommands, registerCommands]);

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
      registerCommands: () => {},
    };
  }
  return context;
};
