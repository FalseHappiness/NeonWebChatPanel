import "../styles/toast-scss.scss"
import "../styles/toast.css"
import { useToast } from "vue-toastification";
import ToastIcon from "../components/utils/ToastIcon.vue";

const toast = useToast({
  transition: "Vue-Toastification__fade",
  maxToasts: 20,
  newestOnTop: true,
  filterBeforeCreate: (ts, toasts) => {
    if (toasts.filter(
      t => {
        if ((t.type === ts.type) && (t.content === ts.content)) {
          toast.update(t.id, { content: t.content, options: { timeout: 3000 } });
          return true;
        }
        return false;
      }
    ).length !== 0) {
      // 返回 false 将丢弃 Toast
      return false;
    }
    // 如果需要，您可以修改 ts
    return ts;
  }
});

const showToast = (type, text, time) => {
  toast[type](text, {
    position: "top-center",
    timeout: time || 3000,
    closeOnClick: false,
    pauseOnFocusLoss: false,
    pauseOnHover: false,
    draggable: false,
    draggablePercent: 0.6,
    showCloseButtonOnHover: false,
    hideProgressBar: true,
    closeButton: false,
    icon: ToastIcon,
    rtl: false
  });
}

const showErrorToast = (text, time) => showToast('error', text, time)

window.showToast = showToast

export {
  showToast,
  showErrorToast
}