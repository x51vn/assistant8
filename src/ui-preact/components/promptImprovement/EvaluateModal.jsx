/**
 * EvaluateModal.jsx – Modal for evaluating a prompt run via LLM.
 *
 * Two modes:
 *  Option A  – Copy evaluator prompt to clipboard, paste LLM output back
 *  Option B  – Enter raw JSON directly
 */

import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { buildEvalPrompt, parseEvalOutput } from '../../api/promptImprovementApi.js';

const STEP = { LOADING: 'loading', READY: 'ready', SUBMITTING: 'submitting', DONE: 'done', ERROR: 'error' };

export function EvaluateModal({ run, onClose, onSuccess }) {
  const [step, setStep] = useState(STEP.LOADING);
  const [evalPrompt, setEvalPrompt] = useState('');
  const [rawOutput, setRawOutput] = useState('');
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState([]);
  const [copied, setCopied] = useState(false);
  const [redact, setRedact] = useState(false);
  const textareaRef = useRef(null);

  // Load evaluator prompt on open
  useEffect(() => {
    (async () => {
      setStep(STEP.LOADING);
      const res = await buildEvalPrompt(run.id, { redact });
      if (res.error) {
        setErrors([res.error.message]);
        setStep(STEP.ERROR);
        return;
      }
      setEvalPrompt(res.evalPrompt);
      setStep(STEP.READY);
    })();
  }, [run.id, redact]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(evalPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = evalPrompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmit = async () => {
    if (!rawOutput.trim()) return;
    setStep(STEP.SUBMITTING);
    setErrors([]);

    const res = await parseEvalOutput(rawOutput, run.id);
    if (res.error) {
      setErrors([res.error.message]);
      setStep(STEP.READY);
      return;
    }
    if (!res.success) {
      setErrors(res.errors?.length ? res.errors : ['Không thể phân tích output. Vui lòng thử lại.']);
      setStep(STEP.READY);
      return;
    }

    setResult(res);
    setStep(STEP.DONE);
  };

  const handleDone = () => {
    if (onSuccess) onSuccess(result);
    onClose();
  };

  return (
    <div class="confirm-dialog-overlay" onClick={onClose}>
      <div class="pi-eval-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div class="pi-eval-modal__header">
          <h3><i class="fas fa-star-half-alt"></i> Đánh giá Run</h3>
          <button class="btn-icon" onClick={onClose} title="Đóng">
            <i class="fas fa-times"></i>
          </button>
        </div>

        {/* Body */}
        <div class="pi-eval-modal__body">
          {step === STEP.LOADING && (
            <div class="pi-eval-loading">
              <i class="fas fa-spinner fa-spin"></i> Đang tạo evaluator prompt...
            </div>
          )}

          {(step === STEP.READY || step === STEP.SUBMITTING) && (
            <div class="pi-eval-steps">
              {/* Step 1: Copy prompt */}
              <div class="pi-eval-step">
                <div class="pi-eval-step__label">
                  <span class="pi-step-num">1</span>
                  Copy evaluator prompt → dán vào ChatGPT/Claude/Gemini
                </div>
                <div class="pi-eval-step__actions">
                  <label class="pi-eval-checkbox">
                    <input
                      type="checkbox"
                      checked={redact}
                      onChange={(e) => setRedact(e.target.checked)}
                    />
                    Redact PII
                  </label>
                  <button class="btn-sm pi-btn-copy" onClick={handleCopy}>
                    <i class={copied ? 'fas fa-check' : 'fas fa-copy'}></i>
                    {copied ? 'Đã copy!' : 'Copy Prompt'}
                  </button>
                </div>
                {evalPrompt && (
                  <details class="pi-eval-prompt-preview">
                    <summary>Xem evaluator prompt</summary>
                    <pre class="pi-eval-prompt-text">{evalPrompt}</pre>
                  </details>
                )}
              </div>

              {/* Step 2: Paste output */}
              <div class="pi-eval-step">
                <div class="pi-eval-step__label">
                  <span class="pi-step-num">2</span>
                  Dán kết quả từ LLM vào đây
                </div>
                <textarea
                  ref={textareaRef}
                  class="pi-eval-textarea"
                  rows={8}
                  placeholder={'Dán toàn bộ output của LLM (bao gồm cả JSON) vào đây...'}
                  value={rawOutput}
                  onInput={(e) => setRawOutput(e.target.value)}
                  disabled={step === STEP.SUBMITTING}
                />
              </div>

              {/* Errors */}
              {errors.length > 0 && (
                <div class="pi-eval-errors">
                  {errors.map((err, i) => (
                    <div key={i} class="pi-eval-error-item">
                      <i class="fas fa-exclamation-circle"></i> {err}
                    </div>
                  ))}
                </div>
              )}

              {/* Submit */}
              <div class="pi-eval-step__actions pi-eval-submit-row">
                <button
                  class="btn-sm pi-btn-evaluate"
                  onClick={handleSubmit}
                  disabled={!rawOutput.trim() || step === STEP.SUBMITTING}
                >
                  {step === STEP.SUBMITTING
                    ? (<><i class="fas fa-spinner fa-spin"></i> Đang xử lý...</>)
                    : (<><i class="fas fa-check"></i> Gửi đánh giá</>)
                  }
                </button>
              </div>
            </div>
          )}

          {step === STEP.DONE && result && (
            <div class="pi-eval-done">
              <div class="pi-eval-done__icon">
                <i class="fas fa-check-circle"></i>
              </div>
              <h4>Đánh giá thành công!</h4>
              <div class="pi-eval-done__summary">
                <div class="pi-eval-done__score">
                  <span class="pi-score-label">Score:</span>
                  <span class="pi-score-value">{result.evaluation?.score ?? '—'}/100</span>
                </div>
                {result.evaluation?.lesson_text && (
                  <div class="pi-eval-done__lesson">
                    <strong>Bài học:</strong> {result.evaluation.lesson_text}
                  </div>
                )}
                {result.evaluation?.tags?.length > 0 && (
                  <div class="pi-eval-done__tags">
                    {result.evaluation.tags.map((t) => (
                      <span key={t} class="pi-tag">{t}</span>
                    ))}
                  </div>
                )}
                {result.evaluation?.issues?.length > 0 && (
                  <div class="pi-eval-done__issues">
                    <strong>Issues:</strong>
                    <ul>
                      {result.evaluation.issues.map((iss, i) => <li key={i}>{iss}</li>)}
                    </ul>
                  </div>
                )}
                {result.evaluation?.strengths?.length > 0 && (
                  <div class="pi-eval-done__strengths">
                    <strong>Strengths:</strong>
                    <ul>
                      {result.evaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
              </div>
              <button class="btn-sm pi-btn-evaluate" onClick={handleDone}>
                <i class="fas fa-check"></i> Xong
              </button>
            </div>
          )}

          {step === STEP.ERROR && (
            <div class="pi-eval-errors">
              {errors.map((err, i) => (
                <div key={i} class="pi-eval-error-item">
                  <i class="fas fa-exclamation-circle"></i> {err}
                </div>
              ))}
              <button class="btn-sm" onClick={onClose}>Đóng</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
