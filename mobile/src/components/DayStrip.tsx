import * as React from 'react';
import {StyleSheet, View, ScrollView, TouchableOpacity} from 'react-native';
import {IconButton, Text, useTheme} from 'react-native-paper';

interface Props {
  selectedDate: Date;
  onChangeSelectedDate: (date: Date) => void;
}

function addDays(base: Date, delta: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

const DayStrip: React.FC<Props> = ({
                                     selectedDate,
                                     onChangeSelectedDate,
                                   }) => {
  const theme = useTheme();
  const scrollViewRef = React.useRef<ScrollView>(null);
  const [scrollViewWidth, setScrollViewWidth] = React.useState(0);

  const today = React.useMemo(() => startOfDay(new Date()), []);
  const minDate = React.useMemo(() => addDays(today, -3), [today]);
  const maxDate = React.useMemo(() => addDays(today, 3), [today]);

  const days = React.useMemo(() => {
    const result: Date[] = [];
    for (let i = -3; i <= 3; i++) {
      result.push(addDays(today, i));
    }
    return result;
  }, [today]);

  const canGoLeft = startOfDay(selectedDate).getTime() > minDate.getTime();
  const canGoRight = startOfDay(selectedDate).getTime() < maxDate.getTime();

  React.useEffect(() => {
    if (scrollViewWidth === 0) return;

    const selectedIndex = days.findIndex(
      d => d.toDateString() === selectedDate.toDateString()
    );

    if (selectedIndex !== -1 && scrollViewRef.current) {
      const itemWidth = 52;
      const offset = selectedIndex * itemWidth - (scrollViewWidth / 2) + (itemWidth / 2);

      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          x: offset,
          animated: true,
        });
      }, 0);
    }
  }, [selectedDate, days, scrollViewWidth]);

  const handlePrev = () => {
    if (!canGoLeft) {
      return;
    }
    onChangeSelectedDate(addDays(selectedDate, -1));
  };

  const handleNext = () => {
    if (!canGoRight) {
      return;
    }
    onChangeSelectedDate(addDays(selectedDate, +1));
  };

  return (
    <View style={styles.root}>
      <IconButton
        icon="chevron-left"
        size={24}
        onPress={handlePrev}
        disabled={!canGoLeft}
      />
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.daysScroll}
        contentContainerStyle={styles.daysRow}
        onLayout={(e) => setScrollViewWidth(e.nativeEvent.layout.width)}>
        {days.map(d => {
          const isSelected =
            d.toDateString() === selectedDate.toDateString();
          const isToday = d.toDateString() === today.toDateString();
          const dayNum = d.getDate();

          return (
            <TouchableOpacity
              key={d.toISOString()}
              style={[
                styles.dayBubble,
                {backgroundColor: theme.colors.surfaceVariant},
                isSelected && {
                  backgroundColor: theme.colors.primary,
                },
              ]}
              onPress={() => onChangeSelectedDate(d)}
              disabled={
                d.getTime() < minDate.getTime() ||
                d.getTime() > maxDate.getTime()
              }>
              <Text
                style={[
                  styles.dayText,
                  {color: theme.colors.onSurfaceVariant},
                  isSelected && {
                    color: theme.colors.onPrimary,
                    fontWeight: '600',
                  },
                ]}>
                {dayNum}
              </Text>
              {isToday && (
                <Text
                  style={[
                    styles.todayLabel,
                    isSelected && {color: theme.colors.onPrimary},
                  ]}>
                  today
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <IconButton
        icon="chevron-right"
        size={24}
        onPress={handleNext}
        disabled={!canGoRight}
      />
    </View>
  );
};

export default DayStrip;

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  daysScroll: {
    flex: 1,
  },
  daysRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 14,
  },
  todayLabel: {
    fontSize: 10,
    marginTop: 1,
    opacity: 0.7,
  },
});