type Listener = (visible: boolean) => void;

/**
 * Cold starts always show the launch screen, so the module starts visible;
 * LaunchScreen publishes every change. The app tour subscribes so it never
 * starts animating underneath the splash.
 */
let visible = true;
const listeners = new Set<Listener>();

export const isLaunchScreenVisible = () => visible;

export const setLaunchScreenVisible = (next: boolean) => {
  if (visible === next) {
    return;
  }
  visible = next;
  listeners.forEach((listener) => listener(next));
};

export const subscribeLaunchScreenVisibility = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
