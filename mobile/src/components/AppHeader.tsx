import * as React from 'react';
import {StyleSheet, View} from 'react-native';
import { IconButton, Text, useTheme } from 'react-native-paper';

interface Props {
  onPressSettings: () => void;
  onPressEdit: () => void;
  isEditing?: boolean;
  selectedDate: Date;
}

const WEEKDAYS = [
  'Неділя',
  'Понеділок',
  'Вівторок',
  'Середа',
  'Четвер',
  'Пʼятниця',
  'Субота',
];

const MONTHS = [
  'січня',
  'лютого',
  'березня',
  'квітня',
  'травня',
  'червня',
  'липня',
  'серпня',
  'вересня',
  'жовтня',
  'листопада',
  'грудня',
];

const AppHeader: React.FC<Props> = ({
                                      onPressSettings,
                                      onPressEdit,
                                      isEditing = false,
                                      selectedDate,
                                    }) => {
  const theme = useTheme();
  const now = selectedDate;
  const weekday = WEEKDAYS[now.getDay()];
  const day = now.getDate();
  const month = MONTHS[now.getMonth()];

  return (
    <View style={styles.root}>
      <View style={styles.left}>
        <Text
          variant="titleMedium"
          style={[styles.dateText, {color: theme.colors.onBackground}]}>
          {weekday}
        </Text>
        <Text
          variant="headlineSmall"
          style={[styles.dateText, {color: theme.colors.onBackground}]}>
          {day} {month}
        </Text>
      </View>
      <View style={styles.right}>
        <IconButton
          icon={isEditing ? 'check' : 'pencil-outline'}
          size={22}
          onPress={onPressEdit}
        />
        <IconButton
          icon="cog-outline"
          size={22}
          onPress={onPressSettings}
        />
      </View>
    </View>
  );
};

export default AppHeader;

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    flexDirection: 'column',
  },
  right: {
    flexDirection: 'row',
  },
  dateText: {
  },
});