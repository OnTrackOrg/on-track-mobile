import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import HomeScreen from './components/HomeScreen';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  removeItem: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('react-native-draggable-flatlist', () => 'DraggableFlatList');

jest.mock('./components/RadarChart', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return function MockRadarChart(props: { mode: string }) {
    return <Text testID="radar-chart">mode:{props.mode}</Text>;
  };
});

jest.mock('./components/DateContextCard', () => 'DateContextCard');
jest.mock('./components/CalendarModal', () => 'CalendarModal');

jest.mock('./utils/haptics', () => ({
  haptics: {
    tap: jest.fn().mockResolvedValue(undefined),
    navigate: jest.fn().mockResolvedValue(undefined),
    warning: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('./lib/dateContext', () => ({
  getNextTrackingDate: (date: Date) => date,
  getPreviousTrackingDate: (date: Date) => date,
}));

jest.mock('./lib/auth', () => ({
  deleteCurrentAccount: jest.fn(),
}));

jest.mock('./onboarding', () => ({
  ONBOARDING_STORAGE_KEY: 'onboarding-key',
}));

jest.mock('./contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      background: '#000',
      surface: '#111',
      text: '#fff',
      textSecondary: '#aaa',
      border: '#333',
      primary: '#0af',
      warning: '#fa0',
      success: '#0f0',
    },
    isDark: true,
    toggleTheme: jest.fn(),
  }),
}));

const setHomeRadarMode = jest.fn();

const mockState = {
  goals: [],
  selectedDate: new Date('2026-05-06T12:00:00.000Z'),
  account: null,
  setSelectedDate: jest.fn(),
  reorderGoals: jest.fn(),
  deleteGoal: jest.fn(),
  setGoals: jest.fn(),
  setAccount: jest.fn(),
  setCloudSyncEnabled: jest.fn(),
  freezeDay: jest.fn(),
  unfreezeDay: jest.fn(),
  isDayFrozen: jest.fn(() => false),
  getFreezeReason: jest.fn(() => undefined),
  homeRadarMode: 'current' as const,
  setHomeRadarMode,
};

jest.mock('./store', () => ({
  useStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
  debugAsyncStorage: jest.fn(),
  getCurrentMode: () => 'PROD',
  getGoalProgress: () => ({ completed: 0, total: 0, percent: 0, isComplete: false }),
}));

describe('HomeScreen', () => {
  beforeEach(() => {
    setHomeRadarMode.mockClear();
    mockState.homeRadarMode = 'current';
  });

  it('uses and updates the persisted radar mode preference', () => {
    const navigation = { setOptions: jest.fn(), navigate: jest.fn() } as never;
    const { getByText, getByTestId, rerender } = render(
      <HomeScreen navigation={navigation} route={{ key: 'Home-1', name: 'Home' } as never} />,
    );

    expect(getByTestId('radar-chart').props.children.join('')).toContain('mode:current');

    fireEvent.press(getByText('All-time trend'));
    expect(setHomeRadarMode).toHaveBeenCalledWith('trend');

    mockState.homeRadarMode = 'trend';
    rerender(<HomeScreen navigation={navigation} route={{ key: 'Home-1', name: 'Home' } as never} />);
    expect(getByTestId('radar-chart').props.children.join('')).toContain('mode:trend');
  });
});
