import React, { type SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

export function Hotel02Icon({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <path d="M3 7v11c0 1.886 0 2.828.586 3.414S5.114 22 7 22h10c1.886 0 2.828 0 3.414-.586S21 19.886 21 18V7m-4 0A5 5 0 0 0 7 7" />
        <path d="M14 22v-4a2 2 0 1 0-4 0v4M9 3H4.472c-.31 0-.625.082-.874.329C2.856 4.064 2.428 5.288 2 7h5m8-4h4.528c.31 0 .625.082.874.329c.742.735 1.17 1.959 1.598 3.671h-5M6 11h.5M6 14.5h.5m11-3.5h.5m-.5 3.5h.5M10.5 8v1.5m0 1.5V9.5m3-1.5v1.5m0 1.5V9.5m-3 0h3" />
      </g>
    </svg>
  );
}

export function UserListIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <path d="M18 21a7.53 7.53 0 0 0-7.005-6.934L10 14q-.532.015-1 .038c-3.7.181-6.716 3.268-7 6.962M18 6.5h4M18 10h4m-2 3.5h2" />
        <circle cx="10" cy="7" r="4" />
      </g>
    </svg>
  );
}

export function HourglassOffIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <path d="M7 3H20" />
        <path d="M5.5 21V18.9696C5.5 17.7277 6.07682 16.5563 7.06116 15.7991L12 12" />
        <path d="M4 21H21" />
        <path d="M2 2L22 22" />
        <path d="M18.5 3V5.03039C18.5 6.27227 17.9232 7.4437 16.9388 8.20089L14.2609 10.2609" />
      </g>
    </svg>
  );
}

export function RepairIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <path d="m11 11-5-5" />
        <path d="m5 7.5 2.5-2.5-3-1.5-1 1 1.5 3Z" />
        <path d="M19.9749 8.97487C20.9858 7.96391 21.2491 6.48836 20.7645 5.23548L19.3425 6.65748H17.3425V4.65748L18.7645 3.23548C17.5116 2.75095 16.0361 3.01416 15.0251 4.02513C14.0138 5.03647 13.7507 6.51274 14.236 7.76593L7.76593 14.236C6.51275 13.7507 5.03647 14.0138 4.02513 15.0251C3.01416 16.0361 2.75095 17.5116 3.23548 18.7645L4.65748 17.3425L6.65748 17.3425L6.65748 19.3425L5.23548 20.7645C6.48836 21.249 7.96391 20.9855 8.97487 19.9749C9.98546 18.9643 10.2489 17.4895 9.76507 16.2369L16.2369 9.76507C17.4895 10.2489 18.9641 9.98546 19.9749 8.97487Z" />
        <path d="m11.797 14.5 5.604 5.6041c.5278.5278 1.3835.5278 1.9114 0l.7917-.7917c.5279-.5279.5279-1.3836 0-1.9114l-5.604-5.6041" />
      </g>
    </svg>
  );
}

export function BellDotIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <path d="M19 11v1.7558c0 .7956.3161 1.5587.8787 2.1213l.6032.6032c.3317.3318.5181.7817.5181 1.2508 0 .9769-.792 1.7689-1.7689 1.7689H4.7689C3.792 18.5 3 17.708 3 16.7311c0-.4691.1864-.919.5181-1.2508l.6032-.6032C4.6839 14.315 5 13.5514 5 12.7558V10c0-3.866 3.134-7 7-7" />
        <path d="M15.5 18.5c0 1.933-1.567 3.5-3.5 3.5s-3.5-1.567-3.5-3.5" />
        <circle cx="18" cy="5" r="3" />
      </g>
    </svg>
  );
}

export function Home04Icon({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <path d="M3 11.9896V14.5c0 3.2998 0 4.9497 1.0251 5.9749C5.0503 21.5 6.7002 21.5 10 21.5h4c3.2998 0 4.9497 0 5.9749-1.0251C21 19.4497 21 17.7998 21 14.5v-2.5104c0-1.6813 0-2.5219-.3559-3.2496-.3559-.7276-1.0194-1.2437-2.3465-2.2759l-2-1.5555C14.2331 3.3029 13.2009 2.5 12 2.5s-2.2331.8029-4.2976 2.4086l-2 1.5555C4.3753 7.4963 3.7118 8.0124 3.3559 8.74 3 9.4677 3 10.3083 3 11.9896Z" />
        <path d="M16 17H8" />
      </g>
    </svg>
  );
}

export function TaskDaily02Icon({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <path d="M20 16V8c0-2.828 0-4.243-.879-5.121C18.243 2 16.828 2 14 2h-4C7.172 2 5.757 2 4.879 2.879 4 3.757 4 5.172 4 8v8c0 2.828 0 4.243.879 5.121C5.757 22 7.172 22 10 22h4c2.828 0 4.243 0 5.121-.879C20 20.243 20 18.828 20 16Z" />
        <path d="M15.5 2h-7c0 1.414 0 2.121.439 2.561C9.379 5 10.086 5 11.5 5h1c1.414 0 2.121 0 2.561-.439C15.5 4.121 15.5 3.414 15.5 2Z" />
        <path d="m7.5 11 1 1 2-2.5M13.5 17h3m-3-6h3M8.625 17H8.5" />
        <path d="M8.75 17a.25.25 0 1 1-.5 0 .25.25 0 0 1 .5 0Z" />
      </g>
    </svg>
  );
}

export function Wallet02Icon({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <path d="M13 3.5h1c.93 0 1.395 0 1.777.102a3.5 3.5 0 0 1 2.121 2.122C18 6.105 18 6.57 18 7.5H5a2 2 0 1 1 0-4h3" />
        <path d="M3 5.5v10c0 2.828 0 4.243.879 5.121C4.757 21.5 6.172 21.5 9 21.5h6c2.828 0 4.243 0 5.121-.879C21 19.743 21 18.328 21 15.5v-2c0-2.828 0-4.243-.879-5.121C19.243 7.5 17.828 7.5 15 7.5H7" />
        <path d="M21 12.5h-2c-.465 0-.698 0-.888.051a1.5 1.5 0 0 0-.061 2.898c.19.051.423.051.949.051h2" />
        <path d="M10.5 2.5A3.5 3.5 0 0 1 14 6c0 .537-.121 1.045-.337 1.5H7.337A3.5 3.5 0 0 1 10.5 2.5Z" />
      </g>
    </svg>
  );
}

export function UserCheck01Icon({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <path d="M3 21c.284-3.694 3.3-6.78 7.001-6.962.312-.015.643-.028.999-.038l.995.066c1.08.072 2.097.37 3.005.847" />
        <circle cx="11" cy="7" r="4" />
        <path d="M14 19.333s.875 0 1.75 1.667c0 0 2.779-4.167 5.25-5" />
      </g>
    </svg>
  );
}
