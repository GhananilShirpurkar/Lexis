/**
 * Optimistic UI update helper utility.
 */

export const shakeElement = (elementOrRef) => {
  const el = elementOrRef?.current || elementOrRef;
  if (!el) return;
  el.classList.remove('shake-error');
  // Trigger DOM reflow
  void el.offsetWidth;
  el.classList.add('shake-error');
  setTimeout(() => {
    el.classList.remove('shake-error');
  }, 350);
};

export const optimisticUpdate = async ({
  optimisticFn,
  apiCall,
  rollbackFn,
  errorMessage = "⚠️ Action failed. Restored original state.",
  targetRef = null,
  toast = null,
}) => {
  if (optimisticFn) optimisticFn();
  try {
    const result = await apiCall();
    return result;
  } catch (err) {
    if (rollbackFn) rollbackFn();
    if (targetRef) shakeElement(targetRef);
    if (toast && toast.error) {
      toast.error(errorMessage);
    } else {
      console.error(errorMessage, err);
    }
    throw err;
  }
};
