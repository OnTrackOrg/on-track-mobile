import React from 'react';
import { render } from '@testing-library/react-native';
import OverviewScreen from './components/OverviewScreen';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Circle: 'Circle',
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('./components/Heatmap', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return function MockHeatmap() {
    return <Text testID="heatmap">heatmap</Text>;
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

const mockState = {
  selectedDate: new Date('2026-05-06T00:00:00.000Z'),
  goals: [
    {
      id: 'goal-1',
      title: 'Fitness',
      createdAt: Date.now(),
      tasks: [
        {
          id: 'recurring-1',
          title: 'Walk',
          frequency: 'daily' as const,
          completions: [new Date('2026-05-05T00:00:00.000Z')],
        },
        {
          id: 'once-1',
          title: 'Buy shoes',
          frequency: 'once' as const,
          completions: [new Date('2026-05-04T00:00:00.000Z')],
        },
        {
          id: 'once-2',
          title: 'Book physio',
          frequency: 'once' as const,
          completions: [new Date('2026-05-03T00:00:00.000Z')],
        },
      ],
    },
  ],
};

jest.mock('./store', () => ({
  useStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
  getCustomFrequencyProgress: () => ({ completed: 0, target: 1, achieved: false }),
  getGoalStreak: () => 0,
}));

describe('OverviewScreen', () => {
  it('renders one combined heatmap for all one-off tasks in a goal', () => {
    const { getAllByTestId, getByText, queryByText } = render(
      <OverviewScreen
        navigation={{} as never}
        route={{ key: 'Consistency-1', name: 'Consistency', params: { goalId: 'goal-1' } } as never}
      />,
    );

    expect(getByText('One-off task history')).toBeTruthy();
    expect(getByText(/grouped into a single combined heatmap/i)).toBeTruthy();
    expect(getAllByTestId('heatmap')).toHaveLength(2);
    expect(getByText('Walk')).toBeTruthy();
    expect(queryByText('Buy shoes')).toBeNull();
    expect(queryByText('Book physio')).toBeNull();
  });
});
