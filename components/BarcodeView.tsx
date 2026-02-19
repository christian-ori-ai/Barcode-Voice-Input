import React, { useMemo } from "react";
import { View, StyleSheet, Platform } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { BarcodeData } from "@/lib/code128";

interface BarcodeViewProps {
  data: BarcodeData;
  width?: number;
  height?: number;
}

export default function BarcodeView({ data, width = 320, height = 100 }: BarcodeViewProps) {
  const barElements = useMemo(() => {
    const totalBars = data.bars.length;
    const barWidth = width / totalBars;
    const elements: React.ReactElement[] = [];

    let runStart = 0;
    let runColor = data.bars[0];

    for (let i = 1; i <= totalBars; i++) {
      if (i === totalBars || data.bars[i] !== runColor) {
        if (runColor) {
          elements.push(
            <Rect
              key={runStart}
              x={runStart * barWidth}
              y={0}
              width={(i - runStart) * barWidth}
              height={height}
              fill="#FFFFFF"
            />
          );
        }
        if (i < totalBars) {
          runStart = i;
          runColor = data.bars[i];
        }
      }
    }

    return elements;
  }, [data.bars, width, height]);

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {barElements}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#000000",
    borderRadius: 4,
    overflow: "hidden",
  },
});
