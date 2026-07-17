import React, { useState, useRef, useEffect } from 'react';
import { Cpu, ChevronDown, Check } from './icons';

export const models = [
  {
    id: 'gemini-1.5-flash',
    value: 'gemini',
    name: 'Gemini 1.5 Flash',
    description: 'Fast, cost-effective for most RAG queries',
    tags: ['Fast', '128K context']
  },
  {
    id: 'gemini-1.5-pro',
    value: 'gemini-pro',
    name: 'Gemini 1.5 Pro',
    description: 'Highest quality, complex document reasoning',
    tags: ['Best quality', '2M context']
  },
  {
    id: 'groq-llama-3',
    value: 'groq',
    name: 'Groq Llama 3',
    description: 'Ultra-fast inference, open weights architecture',
    tags: ['Fastest', '8K context']
  }
];

const ModelSelector = ({ currentModelValue, onChange }) => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeModel = models.find(m => m.value === currentModelValue) || models[0];

  return (
    <div className="model-selector-container" ref={dropdownRef}>
      <button 
        className="model-selector-trigger"
        onClick={() => setOpen(!open)}
      >
        <Cpu className="icon" />
        <span>{activeModel.name}</span>
        <ChevronDown className={`icon chevron ${open ? 'open' : ''}`} />
      </button>

      {open && (
        <div className="model-selector-dropdown">
          {models.map(model => (
            <button
              key={model.id}
              className={`model-option ${model.value === currentModelValue ? 'active' : ''}`}
              onClick={() => {
                onChange(model.value);
                setOpen(false);
              }}
            >
              <div className="model-option-header">
                <span className="model-name">{model.name}</span>
                {model.value === currentModelValue && (
                  <Check className="icon-small" />
                )}
              </div>
              <span className="model-description">{model.description}</span>
              <div className="model-tags">
                {model.tags.map(tag => (
                  <span key={tag} className="model-tag">{tag}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ModelSelector;
