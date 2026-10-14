"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { Z_LAYERS } from "./Overlay";

interface SelectOption {
  label: string;
  value: string;
  /** Shown in the list but not selectable, e.g. an inactive establishment. */
  disabled?: boolean;
}

interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function SelectField({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  className = "",
  disabled = false,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        // The full label, for a closed control that had to cut it short.
        title={selectedOption?.label}
        className="w-full h-11 pl-4 pr-3 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer flex items-center justify-between gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {/* One line, always: the control is a fixed 44px tall, so a long
            label (a course's full name) is cut with an ellipsis here and
            shown whole in the open list below. `min-w-0` is what lets a flex
            child shrink enough to truncate at all. */}
        <span
          className={`min-w-0 flex-1 truncate text-left ${
            selectedOption ? "text-gray-900" : "text-gray-400"
          }`}
        >
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && !disabled && (
        <div
          style={{ zIndex: Z_LAYERS.dropdown }}
          role="listbox"
          // Exactly as wide as the control, so it can never run off the
          // screen; a long option wraps onto more lines here instead.
          className="absolute left-0 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              onClick={() => !option.disabled && handleSelect(option.value)}
              role="option"
              aria-selected={option.value === value}
              className={`block w-full px-4 py-2.5 text-sm text-left break-words transition-colors ${
                option.disabled
                  ? "text-gray-300 cursor-not-allowed"
                  : option.value === value
                    ? "bg-blue-100 text-blue-700 font-medium hover:bg-blue-50"
                    : "text-gray-700 hover:bg-blue-50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
