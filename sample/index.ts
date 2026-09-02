"use strict";

import React from "react";
import { createRoot } from "react-dom/client";
import { SampleApp } from "./SampleApp";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(React.createElement(SampleApp));
