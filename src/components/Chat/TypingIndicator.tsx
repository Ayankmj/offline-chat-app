import React, {useEffect, useRef} from 'react';
import {View, Animated, StyleSheet} from 'react-native';

/**
 * TypingIndicator — 3-dot bounce animation (ChatGPT / DeepSeek style)
 * Show when: modelStore.inferencing === true && modelStore.isStreaming === false
 * i.e., model received the request but hasn't started streaming tokens yet.
 */
export const TypingIndicator: React.FC = () => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  const bounce = (dot: Animated.Value, delay: number) =>
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(dot, {
          toValue: -6,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(dot, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.delay(420),
      ]),
    );

  useEffect(() => {
    const a1 = bounce(dot1, 0);
    const a2 = bounce(dot2, 160);
    const a3 = bounce(dot3, 320);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View
            key={i}
            style={[styles.dot, {transform: [{translateY: dot}]}]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignItems: 'flex-start',
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#f0f0f0',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#aaa',
  },
});
