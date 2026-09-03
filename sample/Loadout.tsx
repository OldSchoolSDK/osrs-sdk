import React from "react";
import { Modal } from "osrs-sdk-react";

export type LoadoutProps = {
  onClose: () => void;
  open: boolean;
};

export function Loadout({ onClose, open }: LoadoutProps) {
  return (
    <Modal open={open}>
      <div
        style={{
          backgroundColor: "#282828",
          border: "1px solid #FFFF00",
          color: "#FFFF00",
          minWidth: 320,
          padding: 20,
        }}
      >
        <h2>Loadout</h2>
        <p>Loadout configuration coming soon.</p>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
