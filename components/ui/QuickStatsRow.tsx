import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LucideIcon } from 'lucide-react-native';

import { useTheme } from '@/context/ThemeContext';

export interface StatItem {
  icon: LucideIcon;
  iconColor: string;
  value: string | number;
  label: string;
}

export interface QuickStatsRowProps {
  stats: StatItem[];
}

export const QuickStatsRow = memo(function QuickStatsRow({ stats }: QuickStatsRowProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      {stats.map((stat, index) => (
        <React.Fragment key={stat.label}>
          {index > 0 && (
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          )}
          <View style={styles.stat}>
            <stat.icon size={16} color={stat.iconColor} />
            <Text style={[styles.value, { color: colors.text }]}>
              {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
            </Text>
            <Text style={[styles.label, { color: colors.textMuted }]}>{stat.label}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 4,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  value: {
    fontSize: 18,
    fontWeight: '700',
  },
  label: {
    fontSize: 11,
  },
  divider: {
    width: 1,
    height: 40,
  },
});

export default QuickStatsRow;
