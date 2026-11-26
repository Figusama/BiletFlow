import React from 'react';
import Svg, { Path } from 'react-native-svg';

// Иконки 24x24 (или своя viewBox). Иконки сайта (search, bell, calendar, menu, ban, plus, chevronLeft,
// checkCircle, xCircle, clock) взяты из frontend/public/icons. Остальных на сайте нет, они нарисованы в том же линейном стиле.
type Def = {
  paths: readonly string[];
  viewBox?: string;
  fill?: boolean; // true: рисуем заливкой (как search, plus, chevronLeft на сайте), иначе линией
  stroke?: number; // толщина линии по умолчанию
};

export const ICONS = {
  // ---- с сайта ----
  search: {
    viewBox: '0 0 20 20',
    fill: true,
    paths: ['M4 9a5 5 0 1110 0A5 5 0 014 9zm5-7a7 7 0 104.2 12.6.999.999 0 00.093.107l3 3a1 1 0 001.414-1.414l-3-3a.999.999 0 00-.107-.093A7 7 0 009 2z'],
  },
  bell: {
    stroke: 2,
    paths: ['M9 21h6M18 8.6c0-1.49-.63-2.91-1.76-3.96A6.24 6.24 0 0 0 12 3c-1.59 0-3.12.59-4.24 1.64A5.39 5.39 0 0 0 6 8.6c0 2.69-.68 4.58-1.47 5.89-.77 1.26-1.16 1.89-1.15 2.05.02.19.05.25.2.36.13.1.76.1 2.02.1h12.79c1.26 0 1.89 0 2.02-.1.15-.11.18-.17.2-.36.01-.16-.37-.79-1.14-2.05C18.68 13.18 18 11.29 18 8.6Z'],
  },
  calendar: {
    stroke: 2,
    paths: ['M3 10H21M7 3V5M17 3V5M6.2 21H17.8C18.9201 21 19.4802 21 19.908 20.782C20.2843 20.5903 20.5903 20.2843 20.782 19.908C21 19.4802 21 18.9201 21 17.8V8.2C21 7.07989 21 6.51984 20.782 6.09202C20.5903 5.71569 20.2843 5.40973 19.908 5.21799C19.4802 5 18.9201 5 17.8 5H6.2C5.0799 5 4.51984 5 4.09202 5.21799C3.71569 5.40973 3.40973 5.71569 3.21799 6.09202C3 6.51984 3 7.07989 3 8.2V17.8C3 18.9201 3 19.4802 3.21799 19.908C3.40973 20.2843 3.71569 20.5903 4.09202 20.782C4.51984 21 5.07989 21 6.2 21Z'],
  },
  menu: { stroke: 2.5, paths: ['M3 6.00092H21M3 12.0009H21M3 18.0009H21'] },
  ban: {
    stroke: 2,
    paths: ['M5.5 5.5L18.5 18.5M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z'],
  },
  plus: {
    viewBox: '0 0 20 20',
    fill: true,
    paths: ['M9 17a1 1 0 102 0v-6h6a1 1 0 100-2h-6V3a1 1 0 10-2 0v6H3a1 1 0 000 2h6v6z'],
  },
  chevronLeft: {
    fill: true,
    paths: ['M14.2893 5.70708C13.8988 5.31655 13.2657 5.31655 12.8751 5.70708L7.98768 10.5993C7.20729 11.3805 7.2076 12.6463 7.98837 13.427L12.8787 18.3174C13.2693 18.7079 13.9024 18.7079 14.293 18.3174C14.6835 17.9269 14.6835 17.2937 14.293 16.9032L10.1073 12.7175C9.71678 12.327 9.71678 11.6939 10.1073 11.3033L14.2893 7.12129C14.6799 6.73077 14.6799 6.0976 14.2893 5.70708Z'],
  },
  checkCircle: {
    stroke: 1.5,
    paths: ['M12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22Z', 'M7.75 12L10.58 14.83L16.25 9.17004'],
  },
  xCircle: {
    stroke: 2,
    paths: ['M9 9L15 15M15 9L9 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z'],
  },
  clock: {
    stroke: 2,
    paths: ['M12 7V12L14.5 13.5M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z'],
  },

  // ---- нарисованы под стиль сайта (на сайте таких нет) ----
  ticket: {
    stroke: 2,
    paths: [
      'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z',
      'M13 5v2', 'M13 11v2', 'M13 17v2',
    ],
  },
  shield: { stroke: 2, paths: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'] },
  globe: {
    stroke: 2,
    paths: [
      'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M2 12h20',
      'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
    ],
  },
  plusCircle: { stroke: 2, paths: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 8v8', 'M8 12h8'] },
  help: { stroke: 2, paths: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', 'M12 17h.01'] },
  userPlus: { stroke: 2, paths: ['M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M8.5 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M20 8v6', 'M23 11h-6'] },
  users: {
    stroke: 2,
    paths: [
      'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
      'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75',
    ],
  },
  folder: { stroke: 2, paths: ['M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'] },
  fileText: { stroke: 2, paths: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'] },
  edit: { stroke: 2, paths: ['M12 20h9', 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'] },
  creditCard: { stroke: 2, paths: ['M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M1 10h22'] },
  undo: { stroke: 2, paths: ['M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'] },
  chevronRight: { stroke: 2, paths: ['M9 18l6-6-6-6'] },
  arrowLeft: { stroke: 2, paths: ['M19 12H5', 'M12 19l-7-7 7-7'] },
  refresh: { stroke: 2, paths: ['M23 4v6h-6', 'M1 20v-6h6', 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10', 'M20.49 15a9 9 0 0 1-14.85 3.36L1 14'] },
  check: { stroke: 2, paths: ['M20 6L9 17l-5-5'] },
  scan: { stroke: 2, paths: ['M3 7V5a2 2 0 0 1 2-2h2', 'M17 3h2a2 2 0 0 1 2 2v2', 'M21 17v2a2 2 0 0 1-2 2h-2', 'M7 21H5a2 2 0 0 1-2-2v-2', 'M7 12h10'] },
} satisfies Record<string, Def>;

export type IconName = keyof typeof ICONS;

type Props = { name: IconName; size?: number; color?: string; strokeWidth?: number };

export default function Icon({ name, size = 22, color = '#FFFFFF', strokeWidth }: Props) {
  const def: Def = ICONS[name];
  return (
    <Svg
      width={size}
      height={size}
      viewBox={def.viewBox ?? '0 0 24 24'}
      fill="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {def.paths.map((d, i) =>
        def.fill ? (
          <Path key={i} d={d} fill={color} fillRule="evenodd" />
        ) : (
          <Path
            key={i}
            d={d}
            stroke={color}
            strokeWidth={strokeWidth ?? def.stroke ?? 2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      )}
    </Svg>
  );
}
