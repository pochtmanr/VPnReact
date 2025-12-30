/**
 * RTL Hook and Utilities
 *
 * Provides RTL-aware styling and layout utilities for Arabic and Persian languages.
 */

import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { RTL_LANGUAGES } from './index';

/**
 * Hook that provides RTL-aware utilities
 */
export const useRTL = () => {
  const { i18n } = useTranslation();

  const isRTL = useMemo(() => {
    return RTL_LANGUAGES.includes(i18n.language);
  }, [i18n.language]);

  /**
   * Get RTL-aware flex direction
   */
  const flexDirection = useCallback(
    (direction: 'row' | 'column' = 'row'): ViewStyle['flexDirection'] => {
      if (direction === 'column') return 'column';
      return isRTL ? 'row-reverse' : 'row';
    },
    [isRTL]
  );

  /**
   * Get RTL-aware text alignment
   */
  const textAlign = useCallback(
    (align: 'left' | 'right' | 'center' = 'left'): TextStyle['textAlign'] => {
      if (align === 'center') return 'center';
      if (isRTL) {
        return align === 'left' ? 'right' : 'left';
      }
      return align;
    },
    [isRTL]
  );

  /**
   * Get RTL-aware alignment
   */
  const alignItems = useCallback(
    (
      align: 'flex-start' | 'flex-end' | 'center' = 'flex-start'
    ): ViewStyle['alignItems'] => {
      if (align === 'center') return 'center';
      if (isRTL) {
        return align === 'flex-start' ? 'flex-end' : 'flex-start';
      }
      return align;
    },
    [isRTL]
  );

  /**
   * Get RTL-aware justify content
   */
  const justifyContent = useCallback(
    (
      justify: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' = 'flex-start'
    ): ViewStyle['justifyContent'] => {
      if (justify === 'center' || justify === 'space-between' || justify === 'space-around') {
        return justify;
      }
      if (isRTL) {
        return justify === 'flex-start' ? 'flex-end' : 'flex-start';
      }
      return justify;
    },
    [isRTL]
  );

  /**
   * Get RTL-aware margin/padding
   */
  const horizontalSpacing = useCallback(
    (
      startValue: number,
      endValue: number = 0
    ): { marginStart?: number; marginEnd?: number; paddingStart?: number; paddingEnd?: number } => {
      return {
        marginStart: startValue,
        marginEnd: endValue,
      };
    },
    []
  );

  /**
   * Transform icon direction for RTL
   * Returns rotation transform for icons that need to flip in RTL
   */
  const iconRotation = useCallback(
    (shouldFlip: boolean = true): ViewStyle['transform'] => {
      if (shouldFlip && isRTL) {
        return [{ scaleX: -1 }];
      }
      return undefined;
    },
    [isRTL]
  );

  /**
   * Get writing direction style
   */
  const writingDirection = useMemo((): TextStyle['writingDirection'] => {
    return isRTL ? 'rtl' : 'ltr';
  }, [isRTL]);

  return {
    isRTL,
    flexDirection,
    textAlign,
    alignItems,
    justifyContent,
    horizontalSpacing,
    iconRotation,
    writingDirection,
    // Direct access to I18nManager for advanced cases
    I18nManager,
  };
};

/**
 * Create RTL-aware styles
 * This utility helps create styles that automatically adjust for RTL languages
 */
export const createRTLStyles = <T extends StyleSheet.NamedStyles<T>>(
  styles: T | StyleSheet.NamedStyles<T>,
  isRTL: boolean
): T => {
  if (!isRTL) {
    return StyleSheet.create(styles) as T;
  }

  const rtlStyles = { ...styles };

  // Transform LTR-specific properties to RTL
  Object.keys(rtlStyles).forEach((key) => {
    const style = rtlStyles[key as keyof T] as ViewStyle & TextStyle;
    if (style) {
      // Swap left/right margins
      if (style.marginStart !== undefined || style.marginEnd !== undefined) {
        const temp = style.marginStart;
        style.marginStart = style.marginEnd;
        style.marginEnd = temp;
      }

      // Swap left/right padding
      if (style.paddingStart !== undefined || style.paddingEnd !== undefined) {
        const temp = style.paddingStart;
        style.paddingStart = style.paddingEnd;
        style.paddingEnd = temp;
      }

      // Swap left/right positioning
      if (style.left !== undefined || style.right !== undefined) {
        const temp = style.left;
        style.left = style.right;
        style.right = temp;
      }

      // Flip text alignment
      if (style.textAlign === 'left') {
        style.textAlign = 'right';
      } else if (style.textAlign === 'right') {
        style.textAlign = 'left';
      }
    }
  });

  return StyleSheet.create(rtlStyles) as T;
};

export default useRTL;
