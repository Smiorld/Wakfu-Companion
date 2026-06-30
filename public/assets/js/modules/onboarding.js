const ONBOARDING_STORAGE_KEY = "wakfu_onboarding_state_v2";
const HELP_BUTTON_DRAG_THRESHOLD = 10;

const ONBOARDING_CONTEXTS = {
  combat: "combat",
  tracker: "tracker",
  tribe: "tribe",
  chat: "chat",
  footer: "footer",
  support: "support",
};

function loadOnboardingState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY) || "{}");
    return {
      teaserShown: Boolean(parsed.teaserShown),
      tourCompleted: Boolean(parsed.tourCompleted),
    };
  } catch (_error) {
    return {
      teaserShown: false,
      tourCompleted: false,
    };
  }
}

let onboardingState = loadOnboardingState();
let onboardingHelpButton = null;
let onboardingHintDriver = null;
let onboardingTourDriver = null;
let onboardingBootstrapped = false;
let onboardingSuppressNextClick = false;
let onboardingDragState = null;
let onboardingHelpButtonHome = null;

function saveOnboardingState() {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(onboardingState));
}

function getDriverFactory() {
  return window.driver?.js?.driver || null;
}

function getOnboardingHelpButton() {
  if (!onboardingHelpButton) {
    onboardingHelpButton = document.getElementById("onboarding-help-btn");
  }

  return onboardingHelpButton;
}

function ensureOnboardingHelpButtonVisible() {
  const helpButton = getOnboardingHelpButton();
  if (helpButton) {
    helpButton.style.display = "inline-flex";
    helpButton.classList.add("is-draggable");
    if (!onboardingHelpButtonHome) {
      onboardingHelpButtonHome = {
        right: helpButton.style.right || "18px",
        bottom: helpButton.style.bottom || "8px",
      };
    }
  }
  return helpButton;
}

function resetOnboardingHelpButtonPosition() {
  const helpButton = getOnboardingHelpButton();
  if (!helpButton) return;

  const home = onboardingHelpButtonHome || { right: "18px", bottom: "8px" };
  helpButton.style.left = "";
  helpButton.style.top = "";
  helpButton.style.right = home.right;
  helpButton.style.bottom = home.bottom;
}

function destroyOnboardingHint() {
  if (onboardingHintDriver) {
    onboardingHintDriver.destroy();
    onboardingHintDriver = null;
  }
}

function destroyOnboardingTour() {
  if (onboardingTourDriver) {
    onboardingTourDriver.destroy();
    onboardingTourDriver = null;
  }
}

function destroyAllOnboardingDrivers() {
  destroyOnboardingHint();
  destroyOnboardingTour();
}

function getOnboardingDriverConfig() {
  return {
    animate: true,
    allowClose: true,
    overlayColor: "#000",
    overlayOpacity: 0.78,
    smoothScroll: true,
    showProgress: true,
    stagePadding: 10,
    stageRadius: 10,
    popoverOffset: 14,
    nextBtnText: "\u4e0b\u4e00\u6b65",
    prevBtnText: "\u4e0a\u4e00\u6b65",
    doneBtnText: "\u5b8c\u6210",
    progressText: "{{current}} / {{total}}",
    popoverClass: "wakfu-onboarding-popover",
  };
}

function createOnboardingStep(element, title, description, side = "bottom", align = "start") {
  return {
    element,
    popover: {
      title,
      description,
      side,
      align,
    },
  };
}

function finishOnboardingTour(driverInstance) {
  onboardingState.tourCompleted = true;
  saveOnboardingState();
  driverInstance.destroy();
}

function buildOverviewSteps() {
  const steps = [
    createOnboardingStep(
      "#combat-panel",
      "\u6218\u6597\u7edf\u8ba1",
      "\u8fd9\u91cc\u662f\u6218\u6597\u7edf\u8ba1\u533a\uff0c\u4f1a\u6839\u636e\u65e5\u5fd7\u5b9e\u65f6\u6574\u7406\u4f24\u5bb3\u3001\u6cbb\u7597\u548c\u62a4\u7532\u6570\u636e\u3002",
      "right",
      "start"
    ),
    createOnboardingStep(
      "#tracker-panel",
      "\u6750\u6599\u8ffd\u8e2a",
      "\u8fd9\u91cc\u662f\u6750\u6599\u8ffd\u8e2a\u533a\uff0c\u4f60\u52a0\u5165\u8ffd\u8e2a\u7684\u7269\u54c1\u4f1a\u5728\u65e5\u5fd7\u51fa\u73b0\u65f6\u81ea\u52a8\u7d2f\u8ba1\u3002",
      "bottom",
      "start"
    ),
    createOnboardingStep(
      "#chat-panel",
      "\u804a\u5929\u4e0e\u7ffb\u8bd1",
      "\u8fd9\u91cc\u4f1a\u663e\u793a\u6e38\u620f\u804a\u5929\u526f\u672c\uff0c\u4e5f\u80fd\u63d0\u4f9b\u5feb\u901f\u7ffb\u8bd1\u548c\u81ea\u52a8\u7ffb\u8bd1\u529f\u80fd\u3002",
      "left",
      "start"
    ),
    createOnboardingStep(
      "#chat-broadcast-strip-anchor",
      "\u90e8\u65cf\u901a\u77e5",
      "\u8fd9\u91cc\u662f\u90e8\u65cf\u901a\u77e5\u5165\u53e3\uff0c\u7528\u6765\u89c2\u5bdf\u5171\u4eab\u7684\u90e8\u65cf\u6311\u6218\u901a\u544a\u3002",
      "bottom",
      "center"
    ),
    createOnboardingStep(
      "#footer-tool-buttons",
      "\u5b9e\u7528\u5de5\u5177",
      "\u4e2d\u4e0b\u65b9\u7684\u84dd\u8272\u6309\u94ae\u662f\u5404\u7c7b\u5b9e\u7528\u5de5\u5177\u5165\u53e3\uff0c\u5305\u62ec\u751f\u4ea7\u8ba1\u7b97\u3001\u5feb\u6377\u4fe1\u606f\u3001\u4f1a\u8bdd\u603b\u7ed3\u4ee5\u53ca\u58f0\u97f3\u8bbe\u7f6e\u3002",
      "top",
      "center"
    ),
    createOnboardingStep(
      "#bug-report-btn",
      "\u53cd\u9988\u4e0e\u793e\u7fa4",
      "\u5de6\u4e0b\u89d2\u8fd9\u91cc\u662f\u652f\u6301\u533a\u3002\u201c\u53cd\u9988 Bug\u201d\u4f1a\u5e2e\u4f60\u51c6\u5907\u65e5\u5fd7\u62f7\u8d1d\uff0c\u53f3\u8fb9\u5219\u662f OOPZ \u5355\u4eba\u670d\u8bed\u97f3\u9891\u9053\u5165\u53e3\u3002",
      "top",
      "start"
    ),
    createOnboardingStep(
      "#onboarding-help-btn",
      "\u4f7f\u7528\u6559\u7a0b",
      "\u76f4\u63a5\u70b9\u51fb\u8fd9\u4e2a\u6309\u94ae\uff0c\u4f1a\u64ad\u653e\u6574\u4e2a\u9875\u9762\u7684\u603b\u89c8\u6559\u7a0b\u3002\u4f60\u4e5f\u53ef\u4ee5\u628a\u5b83\u62d6\u5230\u67d0\u4e2a\u529f\u80fd\u533a\u518d\u653e\u624b\uff0c\u76f4\u63a5\u67e5\u770b\u90a3\u4e00\u533a\u7684\u8be6\u7ec6\u8bf4\u660e\u3002",
      "left",
      "start"
    ),
  ];

  const validSteps = steps.filter((step) => document.querySelector(step.element));
  if (validSteps.length > 0) {
    const lastStep = validSteps[validSteps.length - 1];
    lastStep.popover.onDoneClick = (_element, _step, context) => {
      finishOnboardingTour(context.driver);
    };
  }
  return validSteps;
}

function buildContextSteps(contextKey) {
  const stepsByContext = {
    [ONBOARDING_CONTEXTS.combat]: [
      createOnboardingStep(
        "#combat-panel",
        "\u6218\u6597\u7edf\u8ba1",
        "\u8fd9\u4e2a\u9762\u677f\u4f1a\u8bfb\u53d6\u6218\u6597\u65e5\u5fd7\uff0c\u62c6\u5206\u6210\u4f24\u5bb3\u3001\u6cbb\u7597\u548c\u62a4\u7532\u4e09\u5957\u7edf\u8ba1\u3002",
        "right",
        "start"
      ),
      createOnboardingStep(
        "#combat-panel",
        "\u62d6\u62fd\u5206\u961f\u4e0e\u5408\u5e76",
        "\u9700\u8981\u624b\u52a8\u628a\u89d2\u8272\u62d6\u62fd\u5230\u6b63\u786e\u7684\u961f\u4f0d\u6765\u7edf\u8ba1\u3002\u5982\u679c\u60f3\u5408\u5e76\u4f24\u5bb3\uff0c\u53ef\u4ee5\u628a\u4e00\u4e2a\u89d2\u8272\u62d6\u5230\u53e6\u4e00\u4e2a\u89d2\u8272\u4e0a\u9762\u3002",
        "right",
        "start"
      ),
      createOnboardingStep(
        "#clearSummonBindingsBtn",
        "\u6e05\u5e76",
        "\u53f3\u4e0a\u89d2\u7684\u201c\u6e05\u5e76\u201d\u53ef\u4ee5\u53d6\u6d88\u672c\u573a\u7684\u5408\u5e76\u7ed1\u5b9a\uff0c\u4f46\u4e0d\u4f1a\u628a\u5f53\u524d\u6574\u4f53\u6570\u636e\u6e05\u7a7a\u3002",
        "bottom",
        "center"
      ),
      createOnboardingStep(
        "#combat-pip-btn",
        "\u753b\u4e2d\u753b",
        "\u70b9\u51fb\u753b\u4e2d\u753b\u6309\u94ae\uff0c\u53ef\u4ee5\u5355\u72ec\u5f39\u51fa\u8fd9\u4e2a\u9762\u677f\u7684\u7f6e\u9876\u5c0f\u7a97\u53e3\u3002",
        "bottom",
        "center"
      ),
    ],
    [ONBOARDING_CONTEXTS.tracker]: [
      createOnboardingStep(
        "#tracker-panel",
        "\u6750\u6599\u8ffd\u8e2a",
        "\u8fd9\u91cc\u4f1a\u8ddf\u8e2a\u4f60\u6307\u5b9a\u7684\u7269\u54c1\uff0c\u8bfb\u5230\u76f8\u5173\u65e5\u5fd7\u540e\u81ea\u52a8\u7d2f\u8ba1\u6570\u91cf\u3002",
        "bottom",
        "start"
      ),
      createOnboardingStep(
        "#tracker-panel",
        "\u5e38\u7528\u64cd\u4f5c",
        "\u4f60\u53ef\u4ee5\u641c\u7d22\u5e76\u6dfb\u52a0\u6761\u76ee\uff0c\u4e5f\u53ef\u4ee5\u5bfc\u5165/\u5bfc\u51fa\u8ffd\u8e2a\u8868\uff0c\u8fd8\u80fd\u5207\u6362\u7f51\u683c\u3001\u5217\u8868\u89c6\u56fe\u548c\u5361\u739b\u603b\u8ba1\u3002",
        "bottom",
        "start"
      ),
      createOnboardingStep(
        "#tracker-pip-btn",
        "\u753b\u4e2d\u753b",
        "\u8ffd\u8e2a\u5668\u4e5f\u652f\u6301\u5355\u72ec\u5f39\u51fa\u7f6e\u9876\u5c0f\u7a97\u53e3\uff0c\u65b9\u4fbf\u4f60\u5728\u5176\u4ed6\u754c\u9762\u4e0b\u7ee7\u7eed\u76ef\u8fdb\u5ea6\u3002",
        "bottom",
        "center"
      ),
    ],
    [ONBOARDING_CONTEXTS.chat]: [
      createOnboardingStep(
        "#chat-panel",
        "\u804a\u5929\u4e0e\u7ffb\u8bd1",
        "\u804a\u5929\u65e5\u5fd7\u4f1a\u5728\u8fd9\u91cc\u5b9e\u65f6\u5c55\u793a\uff0c\u65b9\u4fbf\u590d\u67e5\u548c\u7b5b\u9009\u3002",
        "left",
        "start"
      ),
      createOnboardingStep(
        "#quick-trans-btn",
        "\u5feb\u901f\u804a\u5929\u7ffb\u8bd1\u5668",
        "\u8fd9\u4e2a\u6309\u94ae\u4f1a\u5728\u804a\u5929\u9762\u677f\u5e95\u90e8\u5c55\u5f00\u5feb\u901f\u7ffb\u8bd1\u533a\uff0c\u9002\u5408\u5148\u7ffb\u518d\u53d1\u3002",
        "bottom",
        "center"
      ),
      createOnboardingStep(
        "#translation-config-btn",
        "\u7ffb\u8bd1\u5f15\u64ce\u914d\u7f6e",
        "\u8fd9\u91cc\u53ef\u4ee5\u5207\u6362 Google \u6216 Azure \u7ffb\u8bd1\uff0c\u5e76\u586b\u5199 Azure \u6240\u9700\u7684\u914d\u7f6e\u3002",
        "left",
        "center"
      ),
      createOnboardingStep(
        "#chat-pip-btn",
        "\u753b\u4e2d\u753b",
        "\u804a\u5929\u533a\u4e5f\u652f\u6301\u5355\u72ec\u5f39\u51fa\u7f6e\u9876\u7a97\u53e3\u3002",
        "bottom",
        "center"
      ),
    ],
    [ONBOARDING_CONTEXTS.tribe]: [
      createOnboardingStep(
        "#chat-broadcast-strip-anchor",
        "\u90e8\u65cf\u901a\u77e5",
        "\u8fd9\u91cc\u4f1a\u663e\u793a\u5f53\u524d\u6700\u65b0\u7684\u90e8\u65cf\u901a\u544a\uff0c\u70b9\u51fb\u540e\u53ef\u4ee5\u6253\u5f00\u8be6\u7ec6\u5217\u8868\u3002",
        "bottom",
        "center"
      ),
    ],
    [ONBOARDING_CONTEXTS.footer]: [
      createOnboardingStep(
        "#prof-sidebar-btn",
        "\u751f\u4ea7\u8ba1\u7b97",
        "\u7528\u6765\u8ba1\u7b97\u5347\u7ea7\u6240\u9700\u5236\u4f5c\u6b21\u6570\uff0c\u540c\u65f6\u53ef\u4ee5\u7b97\u6750\u6599\u6210\u672c\u4e0e\u4ea7\u51fa\u3002",
        "top",
        "center"
      ),
      createOnboardingStep(
        "#sidebar-btn",
        "\u5feb\u6377\u4fe1\u606f",
        "\u6253\u5f00\u8d44\u6599\u4fa7\u8fb9\u680f\uff0c\u67e5\u770b\u6bcf\u65e5\u3001\u88c2\u7f1d\u3001\u9057\u7269\u7b49\u5e38\u7528\u4fe1\u606f\u3002",
        "top",
        "center"
      ),
      createOnboardingStep(
        "#session-window-btn",
        "\u4f1a\u8bdd\u603b\u7ed3",
        "\u6c47\u603b\u8fd9\u6b21\u6302\u673a\u8fc7\u7a0b\u4e2d\u7684\u7ecf\u9a8c\u3001\u5361\u739b\u3001\u6311\u6218\u548c\u4efb\u52a1\u60c5\u51b5\u3002",
        "top",
        "center"
      ),
      createOnboardingStep(
        "#sound-settings-btn",
        "\u58f0\u97f3\u8bbe\u7f6e",
        "\u53ef\u4ee5\u4e3a\u8ffd\u8e2a\u533a\u548c\u90e8\u65cf\u901a\u77e5\u5206\u522b\u914d\u7f6e\u63d0\u793a\u97f3\uff0c\u4e5f\u652f\u6301\u5bfc\u5165\u81ea\u5b9a\u4e49\u97f3\u9891\u3002",
        "top",
        "center"
      ),
    ],
    [ONBOARDING_CONTEXTS.support]: [
      createOnboardingStep(
        "#bug-report-btn",
        "\u53cd\u9988 Bug",
        "\u5982\u679c\u9047\u5230\u95ee\u9898\uff0c\u5148\u70b9\u8fd9\u91cc\u51c6\u5907\u65e5\u5fd7\u526f\u672c\uff0c\u518d\u53bb\u8054\u7cfb\u7ef4\u62a4\u8005\u3002",
        "top",
        "start"
      ),
      createOnboardingStep(
        "#oopz-link-btn",
        "OOPZ \u8bed\u97f3\u9891\u9053",
        "\u8fd9\u91cc\u4f1a\u6253\u5f00\u6c83\u571f\u5355\u4eba\u670d\u7684 OOPZ \u8bed\u97f3\u9891\u9053\u3002",
        "top",
        "start"
      ),
    ],
  };

  const steps = stepsByContext[contextKey] || buildOverviewSteps();
  const validSteps = steps.filter((step) => {
    const target =
      typeof step.element === "function" ? step.element() : document.querySelector(step.element);
    return Boolean(target);
  });

  if (validSteps.length > 0) {
    const lastStep = validSteps[validSteps.length - 1];
    lastStep.popover.onDoneClick = (_element, _step, context) => {
      finishOnboardingTour(context.driver);
    };
  }

  return validSteps;
}

function startOnboardingTour(contextKey = "overview") {
  ensureOnboardingHelpButtonVisible();
  destroyAllOnboardingDrivers();

  const driverFactory = getDriverFactory();
  if (!driverFactory) return;

  const steps = contextKey === "overview" ? buildOverviewSteps() : buildContextSteps(contextKey);
  if (!steps.length) return;

  onboardingTourDriver = driverFactory(getOnboardingDriverConfig());
  onboardingTourDriver.setSteps(steps);
  onboardingTourDriver.drive(0);
}

function showOnboardingHint() {
  if (onboardingState.teaserShown) return;

  const helpButton = ensureOnboardingHelpButtonVisible();
  const driverFactory = getDriverFactory();
  if (!helpButton || !driverFactory) return;

  onboardingState.teaserShown = true;
  saveOnboardingState();

  onboardingHintDriver = driverFactory({
    ...getOnboardingDriverConfig(),
    showProgress: false,
    overlayOpacity: 0.82,
  });

  onboardingHintDriver.highlight({
    element: helpButton,
    popover: {
      title: "\u4f7f\u7528\u6559\u7a0b",
      description:
        "\u70b9\u51fb\u8fd9\u91cc\u53ef\u4ee5\u67e5\u770b\u6574\u4e2a\u9875\u9762\u7684\u7b80\u77ed\u603b\u89c8\u3002\u5982\u679c\u628a\u6309\u94ae\u62d6\u5230\u67d0\u4e2a\u529f\u80fd\u533a\u518d\u653e\u624b\uff0c\u5219\u4f1a\u76f4\u63a5\u6253\u5f00\u90a3\u4e00\u533a\u7684\u8be6\u7ec6\u8bf4\u660e\u3002",
      side: "left",
      align: "start",
      showButtons: [],
      popoverClass: "wakfu-onboarding-popover",
    },
  });
}

function findOnboardingContextAtPoint(clientX, clientY) {
  const helpButton = getOnboardingHelpButton();
  if (helpButton) {
    helpButton.style.pointerEvents = "none";
  }

  const target = document.elementFromPoint(clientX, clientY);

  if (helpButton) {
    helpButton.style.pointerEvents = "";
  }

  if (!target) return null;

  if (target.closest("#bug-report-btn, #oopz-link-btn")) return ONBOARDING_CONTEXTS.support;
  if (target.closest("#chat-broadcast-strip-anchor")) return ONBOARDING_CONTEXTS.tribe;
  if (target.closest("#chat-panel")) return ONBOARDING_CONTEXTS.chat;
  if (target.closest("#tracker-panel")) return ONBOARDING_CONTEXTS.tracker;
  if (target.closest("#combat-panel")) return ONBOARDING_CONTEXTS.combat;
  if (target.closest("#footer-tool-buttons, #prof-sidebar-btn, #sidebar-btn, #session-window-btn, #sound-settings-btn")) {
    return ONBOARDING_CONTEXTS.footer;
  }

  return null;
}

function beginHelpButtonDrag(event) {
  const helpButton = getOnboardingHelpButton();
  if (!helpButton) return;

  const rect = helpButton.getBoundingClientRect();
  onboardingDragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startLeft: rect.left,
    startTop: rect.top,
    dragging: false,
  };

  helpButton.setPointerCapture?.(event.pointerId);
}

function updateHelpButtonDrag(event) {
  const helpButton = getOnboardingHelpButton();
  if (!helpButton || !onboardingDragState) return;

  const deltaX = event.clientX - onboardingDragState.startX;
  const deltaY = event.clientY - onboardingDragState.startY;

  if (!onboardingDragState.dragging) {
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < HELP_BUTTON_DRAG_THRESHOLD) return;
    onboardingDragState.dragging = true;
    helpButton.classList.add("is-dragging");
    helpButton.style.left = `${onboardingDragState.startLeft}px`;
    helpButton.style.top = `${onboardingDragState.startTop}px`;
    helpButton.style.right = "auto";
    helpButton.style.bottom = "auto";
  }

  const maxLeft = Math.max(8, window.innerWidth - helpButton.offsetWidth - 8);
  const maxTop = Math.max(8, window.innerHeight - helpButton.offsetHeight - 8);
  const nextLeft = Math.min(maxLeft, Math.max(8, onboardingDragState.startLeft + deltaX));
  const nextTop = Math.min(maxTop, Math.max(8, onboardingDragState.startTop + deltaY));

  helpButton.style.left = `${nextLeft}px`;
  helpButton.style.top = `${nextTop}px`;
}

function endHelpButtonDrag(event) {
  const helpButton = getOnboardingHelpButton();
  if (!helpButton || !onboardingDragState) return;

  const wasDragging = onboardingDragState.dragging;
  helpButton.releasePointerCapture?.(onboardingDragState.pointerId);
  helpButton.classList.remove("is-dragging");
  onboardingDragState = null;
  resetOnboardingHelpButtonPosition();

  if (!wasDragging) return;

  onboardingSuppressNextClick = true;
  window.setTimeout(() => {
    onboardingSuppressNextClick = false;
  }, 0);

  const contextKey = findOnboardingContextAtPoint(event.clientX, event.clientY);
  if (contextKey) {
    startOnboardingTour(contextKey);
  }
}

function bindOnboardingHelpButton() {
  const helpButton = getOnboardingHelpButton();
  if (!helpButton || helpButton.dataset.boundOnboarding === "true") return;

  helpButton.dataset.boundOnboarding = "true";

  helpButton.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    beginHelpButtonDrag(event);
  });

  helpButton.addEventListener("pointermove", (event) => {
    updateHelpButtonDrag(event);
  });

  helpButton.addEventListener("pointerup", (event) => {
    endHelpButtonDrag(event);
  });

  helpButton.addEventListener("pointercancel", (event) => {
    endHelpButtonDrag(event);
  });

  helpButton.addEventListener("click", (event) => {
    if (onboardingSuppressNextClick) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    startOnboardingTour("overview");
  });
}

window.onboardingAfterLogsImported = function onboardingAfterLogsImported() {
  ensureOnboardingHelpButtonVisible();
  bindOnboardingHelpButton();

  if (!onboardingBootstrapped) {
    onboardingBootstrapped = true;
    window.setTimeout(() => {
      showOnboardingHint();
    }, 900);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  bindOnboardingHelpButton();
});
