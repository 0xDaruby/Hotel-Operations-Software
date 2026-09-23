'use client';

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: Array<string | false | null | undefined>) {
  return twMerge(clsx(inputs));
}

export interface DropdownItem {
  name: string;
  link?: string;
  value?: string;
}

interface AnimatedDropdownProps {
  items: DropdownItem[];
  text?: string;
  selectedValue?: string;
  onSelect?: (item: DropdownItem) => void;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export default function AnimatedDropdown({
  items,
  text = 'Select option',
  selectedValue,
  onSelect,
  className,
  disabled = false,
  'aria-label': ariaLabel,
}: AnimatedDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectedItem = items.find((item) => item.value === selectedValue);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  function choose(item: DropdownItem) {
    onSelect?.(item);
    setIsOpen(false);
  }

  return (
    <div ref={wrapperRef} className={cn('animated-dropdown', className)} data-state={isOpen ? 'open' : 'closed'}>
      <button
        className="animated-dropdown-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>{selectedItem?.name ?? text}</span>
        <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2, ease: 'easeInOut' }} aria-hidden="true">
          <ChevronDown className="animated-dropdown-chevron" />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="animated-dropdown-menu"
            role="listbox"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            {items.map((item) => (
              onSelect ? (
                <motion.button
                  className={cn('animated-dropdown-option', item.value === selectedValue && 'animated-dropdown-option-selected')}
                  key={item.value ?? item.name}
                  type="button"
                  role="option"
                  aria-selected={item.value === selectedValue}
                  onClick={() => choose(item)}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.14 }}
                >
                  {item.name}
                </motion.button>
              ) : (
                <motion.a
                  className="animated-dropdown-option"
                  key={item.value ?? item.name}
                  href={item.link ?? '#'}
                  onClick={() => setIsOpen(false)}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.14 }}
                >
                  {item.name}
                </motion.a>
              )
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function DropdownField({ children }: { children: ReactNode }) {
  return <div className="animated-dropdown-field">{children}</div>;
}
