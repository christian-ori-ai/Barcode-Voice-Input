import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { BarcodeData } from "@/lib/code128";

interface BarcodeViewProps {
  data: BarcodeData;
  width?: number;
  height?: number;
  quietZoneModules?: number;
}

export default function BarcodeView({
  data,
  width = 320,
  height = 100,
  quietZoneModules = 10,
}: BarcodeViewProps) {
  const barElements = useMemo(() => {
    const totalBars = data.bars.length;
    const totalModules = totalBars + quietZoneModules * 2;
    const moduleWidth = width / totalModules;
    const startX = quietZoneModules * moduleWidth;
    const elements: React.ReactElement[] = [];

    let runStart = 0;
    let runColor = data.bars[0];

    for (let i = 1; i <= totalBars; i++) {
      if (i === totalBars || data.bars[i] !== runColor) {
        if (runColor) {
          elements.push(
            <Rect
              key={runStart}
              x={startX + runStart * moduleWidth}
              y={0}
              width={(i - runStart) * moduleWidth}
              height={height}
              fill="#000000"
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
  }, [data.bars, width, height, quietZoneModules]);

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
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    overflow: "hidden",
  },
});
