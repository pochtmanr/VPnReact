import { BlurView, type BlurViewProps } from 'expo-blur';
import { type FC } from 'react';
import Animated, {
  type SharedValue,
  useAnimatedProps,
} from 'react-native-reanimated';

const RBlurView = Animated.createAnimatedComponent(BlurView);

interface AnimatedBlurViewProps extends BlurViewProps {
  blurIntensity: SharedValue<number>;
}

export const AnimatedBlurView: FC<AnimatedBlurViewProps> = ({ blurIntensity, ...props }) => {
  const animatedProps = useAnimatedProps(() => {
    return {
      intensity: blurIntensity.get(),
    };
  });

  return <RBlurView animatedProps={animatedProps} {...props} />;
};

export default AnimatedBlurView;
