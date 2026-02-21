import React from 'react';
import { cn } from '../../utils';

const MODEL_OPTIONS = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'ollama', label: 'Ollama (local)' },
];

interface StepBasicInfoProps {
  name: string;
  persona: string;
  model: string;
  onNameChange: (v: string) => void;
  onPersonaChange: (v: string) => void;
  onModelChange: (v: string) => void;
}

export const StepBasicInfo: React.FC<StepBasicInfoProps> = ({
  name,
  persona,
  model,
  onNameChange,
  onPersonaChange,
  onModelChange,
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Identity
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Give your agent a name and personality
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-muted-foreground">Agent Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="MantleDegen"
            className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-muted-foreground">Persona</label>
          <textarea
            value={persona}
            onChange={(e) => onPersonaChange(e.target.value)}
            placeholder="You are a ruthless crypto degen on Mantle network. You hunt for the best DeFi yields and deploy meme tokens..."
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Model Provider
        </h2>
        <div className="mt-3 flex gap-2">
          {MODEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onModelChange(opt.value)}
              className={cn(
                'rounded-lg border px-4 py-2 text-sm transition-colors',
                model === opt.value
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border text-muted-foreground hover:border-muted-foreground/30',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
