import React from "react";
import { MODELS } from "../../core/model-registry.js";
import { Overlay } from "./Overlay.js";
import { SelectList } from "./SelectList.js";

interface ModelSelectorProps {
  onSelect: (modelId: string) => void;
  onCancel: () => void;
}

export function ModelSelector({ onSelect, onCancel }: ModelSelectorProps) {
  const items = MODELS.map((m) => ({
    label: `${m.provider}:${m.id}`,
    value: `${m.provider}:${m.id}`,
    description: `${m.name} (${m.costTier})`,
  }));

  return (
    <Overlay title="Select Model">
      <SelectList items={items} onSelect={onSelect} onCancel={onCancel} />
    </Overlay>
  );
}
