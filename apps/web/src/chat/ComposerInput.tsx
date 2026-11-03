import { forwardRef, type TextareaHTMLAttributes } from 'react';

export const ComposerInput = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function ComposerInput({ placeholder, ...props }, ref) {
    return <div className="chat-composer-input">
      <textarea {...props} ref={ref} placeholder={placeholder} />
      {/* Browsers do not consistently ellipsize the native textarea placeholder. */}
      <span className="chat-composer-placeholder" aria-hidden="true">{placeholder}</span>
    </div>;
  },
);
