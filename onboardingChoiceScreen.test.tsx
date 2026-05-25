import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import OnboardingChoiceScreen from './components/OnboardingChoiceScreen';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('./contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      background: '#000',
      surface: '#111',
      text: '#fff',
      textSecondary: '#aaa',
      border: '#333',
      primary: '#0af',
    },
  }),
}));

describe('OnboardingChoiceScreen', () => {
  it('lets users choose between demo data and a clean start', () => {
    const onExploreDemo = jest.fn();
    const onStartFresh = jest.fn();
    const { getByText } = render(
      <OnboardingChoiceScreen onExploreDemo={onExploreDemo} onStartFresh={onStartFresh} />,
    );

    fireEvent.press(getByText('Explore demo goals'));
    expect(onExploreDemo).toHaveBeenCalledTimes(1);

    fireEvent.press(getByText('Start with my own goals'));
    expect(onStartFresh).toHaveBeenCalledTimes(1);
  });
});
