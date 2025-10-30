const selectors = {
  kitchenView: "[data-kitchen-view]",
  panel: "[data-kitchen-panel]",
  overlay: "[data-panel-overlay]",
  list: "[data-panel-list]",
  price: "[data-panel-price]",
  title: "[data-panel-title]",
  empty: "[data-panel-empty]",
  close: "[data-panel-close]",
};

const hotspotSelector = ".hotspot--window, .hotspot--lower, .hotspot--upper";

const formatPrice = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return "--";
};

const normaliseString = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const resolveAreaFromClass = (button) => {
  if (!button) return undefined;
  if (button.dataset.area) return button.dataset.area;
  if (button.classList.contains("hotspot--window")) return "window";
  if (button.classList.contains("hotspot--lower")) return "lower";
  if (button.classList.contains("hotspot--upper")) return "upper";
  return undefined;
};

const getAreaTitle = (button) =>
  normaliseString(button?.dataset.headline) ||
  normaliseString(button?.getAttribute("aria-label")) ||
  normaliseString(button?.textContent) ||
  "Material";

const extractMaterials = (entry) => {
  if (!entry || typeof entry !== "object") return [];

  if (Array.isArray(entry)) {
    return entry;
  }

  if (Array.isArray(entry.materials)) {
    return entry.materials;
  }

  if (Array.isArray(entry.items)) {
    return entry.items;
  }

  if (Array.isArray(entry.options)) {
    return entry.options;
  }

  return [];
};

const pickPrice = (entry, fallbackMaterials) => {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    if (entry.price != null && entry.price !== "") {
      return entry.price;
    }

    if (entry.cost != null && entry.cost !== "") {
      return entry.cost;
    }
  }

  if (Array.isArray(fallbackMaterials)) {
    const pricedItem = fallbackMaterials.find((item) =>
      item && typeof item === "object" && !Array.isArray(item) && item.price != null && item.price !== ""
    );

    if (pricedItem) {
      return pricedItem.price;
    }
  }

  return undefined;
};

const resolveAreaData = (materialsData, areaKey) => {
  if (!materialsData || !areaKey) {
    return { materials: [], price: undefined, description: undefined };
  }

  const lowerKey = areaKey.toLowerCase();
  let entry;

  if (Array.isArray(materialsData)) {
    entry = materialsData.find((item) => {
      if (!item || typeof item !== "object") return false;
      if (item.area && String(item.area).toLowerCase() === lowerKey) return true;
      if (item.key && String(item.key).toLowerCase() === lowerKey) return true;
      return false;
    });
  } else if (typeof materialsData === "object") {
    entry =
      materialsData[areaKey] ??
      materialsData[lowerKey] ??
      materialsData[lowerKey.toUpperCase()] ??
      Object.values(materialsData).find((candidate) => {
        if (!candidate || typeof candidate !== "object") return false;
        if (candidate.area && String(candidate.area).toLowerCase() === lowerKey) return true;
        if (candidate.key && String(candidate.key).toLowerCase() === lowerKey) return true;
        return false;
      });
  }

  if (!entry) {
    return { materials: [], price: undefined, description: undefined };
  }

  const materials = extractMaterials(entry);
  const price = pickPrice(entry, materials);
  const description =
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? normaliseString(entry.description)
      : undefined;

  return { materials, price, description };
};

const buildMaterialItem = (material) => {
  const listItem = document.createElement("li");
  const label = (() => {
    if (material == null) return "Material";
    if (typeof material === "string") return material.trim() || "Material";
    if (typeof material === "number") return String(material);
    if (typeof material === "object") {
      return (
        normaliseString(material.name) ||
        normaliseString(material.title) ||
        normaliseString(material.label) ||
        "Material"
      );
    }
    return "Material";
  })();

  const heading = document.createElement("strong");
  heading.textContent = label;
  listItem.appendChild(heading);

  if (material && typeof material === "object") {
    const attributeKeys = ["category", "finish", "color", "tone", "variant", "code"];
    const attributeParts = attributeKeys
      .map((key) => normaliseString(material[key]))
      .filter(Boolean);
    const description = normaliseString(material.description);
    const meta = [];

    if (attributeParts.length) {
      meta.push(attributeParts.join(" · "));
    }

    if (description) {
      meta.push(description);
    }

    if (meta.length) {
      const metaSpan = document.createElement("span");
      metaSpan.textContent = meta.join(" — ");
      listItem.appendChild(metaSpan);
    }
  }

  return listItem;
};

const renderMaterials = (list, emptyMessage, materials) => {
  if (!list) return;

  list.innerHTML = "";
  const validMaterials = Array.isArray(materials) ? materials.filter((item) => item != null) : [];

  if (!validMaterials.length) {
    if (emptyMessage) {
      emptyMessage.hidden = false;
    }
    return;
  }

  if (emptyMessage) {
    emptyMessage.hidden = true;
  }

  validMaterials.forEach((material) => {
    list.appendChild(buildMaterialItem(material));
  });
};

const setPrice = (priceNode, value) => {
  if (!priceNode) return;
  priceNode.textContent = `Preis: ${formatPrice(value)}`;
};

const initialiseKitchenPanel = () => {
  const kitchenView = document.querySelector(selectors.kitchenView);
  const panel = kitchenView?.querySelector(selectors.panel);
  const hotspots = kitchenView ? Array.from(kitchenView.querySelectorAll(hotspotSelector)) : [];

  if (!kitchenView || !panel || hotspots.length === 0) {
    return;
  }

  const overlay = kitchenView.querySelector(selectors.overlay);
  const list = panel.querySelector(selectors.list);
  const priceNode = panel.querySelector(selectors.price);
  const titleNode = panel.querySelector(selectors.title);
  const emptyMessage = panel.querySelector(selectors.empty);
  const closeButton = panel.querySelector(selectors.close);

  let activeHotspot = null;
  let materialsData = null;
  let materialsPromise = null;

  const ensureMaterials = () => {
    if (!materialsPromise) {
      materialsPromise = (async () => {
        try {
          const response = await fetch("data/materials.json", { cache: "no-store" });
          if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
          }
          materialsData = await response.json();
        } catch (error) {
          console.info("Materialdaten konnten nicht geladen werden.", error);
          materialsData = null;
        }
      })();
    }

    return materialsPromise;
  };

  const openPanel = async (hotspot) => {
    const areaKey = resolveAreaFromClass(hotspot);
    const areaTitle = getAreaTitle(hotspot);

    hotspots.forEach((button) => {
      button.classList.remove("is-active");
      button.setAttribute("aria-expanded", "false");
    });

    hotspot.classList.add("is-active");
    hotspot.setAttribute("aria-expanded", "true");
    activeHotspot = hotspot;

    if (titleNode) {
      titleNode.textContent = areaTitle;
    }

    await ensureMaterials();

    const { materials, price } = resolveAreaData(materialsData, areaKey);

    renderMaterials(list, emptyMessage, materials);
    setPrice(priceNode, price);

    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");

    if (overlay) {
      overlay.classList.add("is-active");
      overlay.setAttribute("aria-hidden", "false");
    }
  };

  const closePanel = (options = { restoreFocus: true }) => {
    if (!panel.classList.contains("is-open")) {
      return;
    }

    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");

    if (overlay) {
      overlay.classList.remove("is-active");
      overlay.setAttribute("aria-hidden", "true");
    }

    if (activeHotspot) {
      activeHotspot.classList.remove("is-active");
      activeHotspot.setAttribute("aria-expanded", "false");
      if (options.restoreFocus) {
        activeHotspot.focus();
      }
      activeHotspot = null;
    }

    if (emptyMessage) {
      emptyMessage.hidden = false;
    }

    if (list) {
      list.innerHTML = "";
    }

    setPrice(priceNode, undefined);
  };

  hotspots.forEach((hotspot) => {
    hotspot.addEventListener("click", () => {
      openPanel(hotspot);
    });
  });

  closeButton?.addEventListener("click", () => closePanel({ restoreFocus: true }));
  overlay?.addEventListener("click", () => closePanel({ restoreFocus: false }));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePanel({ restoreFocus: true });
    }
  });
};

document.addEventListener("DOMContentLoaded", initialiseKitchenPanel);
