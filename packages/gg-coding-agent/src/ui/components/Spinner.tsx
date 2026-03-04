import React, { useState, useEffect } from "react";
import { Text } from "ink";
import { useTheme } from "../theme/theme.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ label }: { label?: string }) {
  const theme = useTheme();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text color={theme.spinnerColor}>
      {FRAMES[frame]} {label && <Text dimColor>{label}</Text>}
    </Text>
  );
}
