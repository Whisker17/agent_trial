import React from 'react';
import { cn } from '../utils';
import type { SkillMeta } from '../api';

interface SkillSelectorProps {
  skills: SkillMeta[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export const SkillSelector: React.FC<SkillSelectorProps> = ({ skills, selected, onChange }) => {
  const toggle = (id: string) => {
    onChange(
      selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id],
    );
  };

  if (skills.length === 0) {
    return <p className="text-sm text-muted-foreground">No skills available.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {skills.map((skill) => {
        const active = selected.includes(skill.id);
        return (
          <button
            key={skill.id}
            type="button"
            onClick={() => toggle(skill.id)}
            className={cn(
              'flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors',
              active
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card hover:border-muted-foreground/30',
            )}
          >
            <div className="flex items-center justify-between">
              <span className={cn('text-sm font-medium', active ? 'text-primary' : 'text-foreground')}>
                {skill.name}
              </span>
              <div
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded border transition-colors',
                  active ? 'border-primary bg-primary' : 'border-muted-foreground/40',
                )}
              >
                {active && (
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-primary-foreground">
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {skill.description}
            </p>
            {skill.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {skill.tags.slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};
