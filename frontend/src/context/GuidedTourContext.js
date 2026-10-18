import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const TOUR_STORAGE_KEY = 'nexora-guided-tour-v1';

const DEFAULT_STEPS = [
  {
    id: 'navigation',
    title: 'Welcome to Nexora Lab',
    description: 'The global navigation keeps your most-used areas one click away. Explore analytics, providers, jobs, and resources.',
    highlights: [
      'Use the top navigation bar to jump between analytics, providers, jobs, and docs.',
      'The breadcrumb below the nav helps you understand where you are.',
    ],
  },
  {
    id: 'dashboard',
    title: 'Analytics Dashboard',
    description: 'Track performance at a glance. Cards surface RAF, member volume, and open gaps with inline explanations.',
    highlights: [
      'Hover info icons on cards to learn how each metric is calculated.',
      'Charts refresh as new data is processed through your integrations.',
    ],
  },
  {
    id: 'providers',
    title: 'Provider Directory',
    description: 'Search the provider directory and open provider details from a single place.',
    highlights: [
      'Filter by provider name, NPI, or tax ID.',
      'Select a row to view provider detail and navigate to the provider page.',
    ],
  },
  {
    id: 'commands',
    title: 'Command Palette',
    description: 'Press ⌘K (or Ctrl+K) anytime to search pages, run actions, or replay this tour.',
    highlights: [
      'Type a page name or action to navigate instantly.',
      'Search “tour” to relaunch onboarding or “help” for docs.',
    ],
  },
];

const GuidedTourContext = createContext(null);

export const GuidedTourProvider = ({ children }) => {
  const [steps] = useState(DEFAULT_STEPS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isCompleted, setIsCompleted] = useState(() => {
    try {
      return localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
    } catch (error) {
      return false;
    }
  });
  const autoStartRef = useRef(false);

  const startTour = useCallback(({ force = false, step = 0 } = {}) => {
    if (!force && isCompleted) {
      return;
    }
    setCurrentIndex(step);
    setIsOpen(true);
  }, [isCompleted]);

  const closeTour = useCallback(() => {
    setIsOpen(false);
  }, []);

  const completeTour = useCallback(() => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    } catch (error) {
      // ignore storage failures
    }
    setIsCompleted(true);
    setIsOpen(false);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev >= steps.length - 1) {
        completeTour();
        return prev;
      }
      return prev + 1;
    });
  }, [steps.length, completeTour]);

  const prevStep = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const restartTour = useCallback(() => {
    setIsCompleted(false);
    startTour({ force: true, step: 0 });
  }, [startTour]);

  useEffect(() => {
    // Keep tour on-demand via Command Palette or Help menu
    return undefined;
  }, []);

  const value = useMemo(() => ({
    isOpen,
    steps,
    currentIndex,
    currentStep: steps[currentIndex],
    isCompleted,
    startTour,
    closeTour,
    skipTour: completeTour,
    nextStep,
    prevStep,
    restartTour,
  }), [
    isOpen,
    steps,
    currentIndex,
    isCompleted,
    startTour,
    closeTour,
    completeTour,
    nextStep,
    prevStep,
    restartTour,
  ]);

  return (
    <GuidedTourContext.Provider value={value}>
      {children}
    </GuidedTourContext.Provider>
  );
};

export const useGuidedTour = () => {
  const context = useContext(GuidedTourContext);
  if (!context) {
    throw new Error('useGuidedTour must be used within GuidedTourProvider');
  }
  return context;
};
