(() => {
    "use strict";

    const species = Array.isArray(window.SKULL_SPECIES) ? window.SKULL_SPECIES : [];
    const fossils = typeof FOSSIL_DATA !== "undefined" && Array.isArray(FOSSIL_DATA) ? FOSSIL_DATA : [];
    const maxCompareSlots = 6;
    const defaultSpeciesId = "sapiens-modern";
    const defaultCameraOrbit = "90deg 90deg 105%";
    const trueScaleCameraRadius = 28;
    const trueScaleFitPadding = 2.7;
    const trueScaleCameraOrbit = `90deg 90deg ${trueScaleCameraRadius}m`;
    const minCameraPhi = "4deg";
    const maxCameraPhi = "176deg";
    const maxFitCameraRadius = "180%";
    const maxTrueScaleCameraRadius = 58;
    const defaultCameraTarget = "auto auto auto";
    const modelOrientation = "90deg -90deg 0deg";
    const userCameraChangeSource = "user-interaction";
    const compareWheelZoomRate = 0.0011;
    const spinDelay = "0";
    const spinSpeed = "24deg";
    const themeTransitionMs = 420;
    const fossilMaterialByTheme = {
        light: {
            baseColor: [1, 0.98, 0.9, 1],
            exposure: 1.08,
            roughness: 0.84,
        },
        dark: {
            baseColor: [0.86, 0.83, 0.76, 1],
            exposure: 0.9,
            roughness: 0.9,
        },
    };
    const fossilTextureCache = {};
    const fossilMaterialState = new WeakMap();
    const compactLayoutQuery = window.matchMedia("(max-width: 719px)");

    const state = {
        mode: "single",
        currentId: defaultSpeciesId,
        compareIds: [],
        trueScale: false,
        spinning: false,
        speciesSearch: "",
        detailPanelOpen: true,
        timelineEra: "all",
        catalogSearch: "",
        catalogSpecies: "",
        catalogLocation: "",
        catalogSort: "age-desc",
        catalogPage: 1,
        catalogView: "grid",
        activeModalId: null,
        activeModalImage: 0,
    };

    const compareCameraSync = {
        applying: false,
        camera: null,
        baselines: new WeakMap(),
    };

    const eraLabels = {
        all: "All Eras",
        earliest: "Earliest Hominins",
        australopithecus: "Australopithecus",
        paranthropus: "Paranthropus",
        "early-homo": "Early Homo",
        "late-pleistocene": "Late Pleistocene",
        sapiens: "Homo sapiens",
    };

    const eraColor = {
        "Early Mammals": "#b76f47",
        "Early Primates": "#9b6a2f",
        "Earliest Hominins": "#8a6a16",
        Australopithecus: "#25776d",
        Paranthropus: "#5b7c28",
        "Early Homo": "#2f65a7",
        "Late Pleistocene": "#7456a8",
        "Homo sapiens": "#111318",
    };

    const speciesAliases = {
        georgicus: "erectus",
    };

    const els = {};

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        cacheElements();
        updateViewportWidth();
        initTheme();
        parseUrlState();
        if (!getSpecies(state.currentId)) state.currentId = species[0]?.id || "";
        if (state.mode === "compare" && !state.compareIds.length) seedComparison();

        els.footerYear.textContent = new Date().getFullYear();
        populateFilters();
        bindEvents();
        renderAll();
        requestAnimationFrame(() => loadCurrentModel());
    }

    function cacheElements() {
        [
            "speciesPanel", "closeSpeciesPanel", "openSpeciesPanel", "openSpeciesPanelLabel", "scrim", "speciesSearch", "speciesList",
            "singleMode", "compareMode", "toggleSpin", "currentEra",
            "currentName", "currentMeta", "singleViewer", "singleView", "compareView", "detailPanel", "detailPanelContent", "toggleDetailPanel",
            "viewerStage", "viewerResetHint", "scaleToggle", "shareCompare", "clearCompare", "eraFilters", "timelineTrack",
            "timelineScale", "timelinePoints", "catalogSearch", "speciesFilter", "locationFilter",
            "sortFilter", "resultCount", "gridView", "listView", "catalogGrid", "loadMore",
            "fossilModal", "modalBackdrop", "modalClose", "modalContent", "toast", "footerYear",
            "themeToggle",
        ].forEach((id) => {
            els[id] = document.getElementById(id);
        });
    }

    function initTheme() {
        if (!els.themeToggle) return;

        const applyTheme = (theme, animate = false) => {
            const normalizedTheme = theme === "dark" ? "dark" : "light";
            document.documentElement.dataset.theme = normalizedTheme;
            els.themeToggle.setAttribute("aria-pressed", String(normalizedTheme === "dark"));
            els.themeToggle.setAttribute("aria-label", normalizedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode");
            els.themeToggle.title = normalizedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode";
            syncFossilMaterialTheme({ animate });
        };

        applyTheme(document.documentElement.dataset.theme);

        els.themeToggle.addEventListener("click", () => {
            const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
            applyTheme(nextTheme, true);
            try {
                localStorage.setItem("skullTheme", nextTheme);
            } catch {
                // Keep the selected theme for this page view if persistent storage is unavailable.
            }
        });
    }

    function bindEvents() {
        els.openSpeciesPanel.addEventListener("click", () => openDrawer(true));
        els.closeSpeciesPanel.addEventListener("click", () => openDrawer(false));
        els.scrim.addEventListener("click", () => openDrawer(false));

        els.speciesSearch.addEventListener("input", () => {
            state.speciesSearch = els.speciesSearch.value.trim().toLowerCase();
            renderSpeciesList();
        });

        els.singleMode.addEventListener("click", () => setMode("single"));
        els.compareMode.addEventListener("click", () => setMode("compare"));
        els.toggleSpin.addEventListener("click", toggleSpin);
        els.toggleDetailPanel.addEventListener("click", toggleDetailPanel);
        els.scaleToggle.addEventListener("click", () => {
            state.trueScale = !state.trueScale;
            resetCompareCameraSync();
            renderCompare();
        });
        els.shareCompare.addEventListener("click", shareComparison);
        els.clearCompare.addEventListener("click", clearComparison);

        els.catalogSearch.addEventListener("input", debounce(() => {
            state.catalogSearch = els.catalogSearch.value.trim().toLowerCase();
            state.catalogPage = 1;
            renderCatalog();
        }, 180));
        els.speciesFilter.addEventListener("change", () => updateCatalogFilter("catalogSpecies", els.speciesFilter.value));
        els.locationFilter.addEventListener("change", () => updateCatalogFilter("catalogLocation", els.locationFilter.value));
        els.sortFilter.addEventListener("change", () => updateCatalogFilter("catalogSort", els.sortFilter.value));
        els.loadMore.addEventListener("click", () => {
            state.catalogPage += 1;
            renderCatalog(true);
        });
        els.gridView.addEventListener("click", () => setCatalogView("grid"));
        els.listView.addEventListener("click", () => setCatalogView("list"));

        els.modalBackdrop.addEventListener("click", closeModal);
        els.modalClose.addEventListener("click", closeModal);
        compactLayoutQuery.addEventListener("change", renderDetailVisibility);
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closeModal();
                openDrawer(false);
            }
        });

        setupNavObserver();
        window.addEventListener("resize", updateViewportWidth, { passive: true });
        window.visualViewport?.addEventListener("resize", updateViewportWidth, { passive: true });
        window.visualViewport?.addEventListener("scroll", updateViewportWidth, { passive: true });
    }

    function updateViewportWidth() {
        const viewportWidth = window.visualViewport?.width || window.innerWidth;
        const documentWidth = document.documentElement.clientWidth || viewportWidth;
        const safeWidth = Math.max(320, Math.floor(Math.min(viewportWidth, documentWidth)));
        document.documentElement.style.setProperty("--app-vw", `${safeWidth}px`);
    }

    function parseUrlState() {
        const params = new URLSearchParams(location.search);
        const speciesParam = params.get("species");
        const compareParam = params.get("compare");
        let shouldCanonicalizeUrl = false;

        const normalizedSpeciesParam = normalizeSpeciesId(speciesParam);
        if (normalizedSpeciesParam && getSpecies(normalizedSpeciesParam)) {
            state.currentId = normalizedSpeciesParam;
            shouldCanonicalizeUrl = normalizedSpeciesParam !== speciesParam;
        }

        if (compareParam) {
            const ids = compareParam
                .split(",")
                .map((id) => id.trim())
                .map(normalizeSpeciesId)
                .filter((id, index, ids) => getSpecies(id) && ids.indexOf(id) === index)
                .slice(0, maxCompareSlots);
            if (ids.length) {
                state.compareIds = ids;
                state.currentId = ids[0];
                state.mode = "compare";
                shouldCanonicalizeUrl = shouldCanonicalizeUrl || ids.join(",") !== compareParam;
            }
        }

        if (shouldCanonicalizeUrl) replaceCanonicalUrl();
    }

    function replaceCanonicalUrl() {
        const url = new URL(location.href);
        if (state.mode === "compare" && state.compareIds.length) {
            url.searchParams.delete("species");
            url.searchParams.set("compare", state.compareIds.join(","));
        } else {
            url.searchParams.delete("compare");
            if (state.currentId !== defaultSpeciesId) url.searchParams.set("species", state.currentId);
            else url.searchParams.delete("species");
        }
        history.replaceState(null, "", url);
    }

    function renderAll() {
        renderMode();
        renderSpeciesList();
        renderCurrentHeader();
        renderDetailPanel();
        renderDetailVisibility();
        renderCompare();
        showResetHint();
        renderTimelineFilters();
        renderTimeline();
        renderCatalog();
    }

    function openDrawer(open) {
        document.body.classList.toggle("drawer-open", open);
    }

    function toggleDetailPanel() {
        state.detailPanelOpen = !state.detailPanelOpen;
        renderDetailVisibility();
    }

    function renderDetailVisibility() {
        const open = compactLayoutQuery.matches || state.detailPanelOpen;
        els.detailPanel.hidden = false;
        els.detailPanel.classList.toggle("is-closed", !open);
        els.detailPanelContent.hidden = !open;
        els.toggleDetailPanel.classList.toggle("is-active", open);
        els.toggleDetailPanel.setAttribute("aria-expanded", String(open));
        els.toggleDetailPanel.setAttribute("aria-label", open ? "Hide details" : "Show details");
        els.toggleDetailPanel.title = open ? "Hide details" : "Show details";
        els.viewerStage.parentElement?.classList.toggle("detail-closed", !open);
    }

    function setMode(mode) {
        state.mode = mode;
        if (mode === "compare") seedComparison();
        renderMode();
        renderSpeciesList();
        renderCompare();
        renderDetailPanel();
        showResetHint();
    }

    function renderMode() {
        const isCompare = state.mode === "compare";
        els.singleMode.classList.toggle("is-active", !isCompare);
        els.singleMode.setAttribute("aria-pressed", String(!isCompare));
        els.compareMode.classList.toggle("is-active", isCompare);
        els.compareMode.setAttribute("aria-pressed", String(isCompare));
        els.singleView.hidden = isCompare;
        els.compareView.hidden = !isCompare;
        els.viewerStage.classList.toggle("is-compare", isCompare);
        els.viewerStage.setAttribute("data-mode", isCompare ? "compare" : "single");
        els.compareMode.textContent = "Compare";
        if (els.openSpeciesPanelLabel) els.openSpeciesPanelLabel.textContent = isCompare ? "Add skull" : "Skulls";
        els.openSpeciesPanel.setAttribute("aria-label", isCompare ? "Add skull to comparison" : "Open skull browser");
        els.scaleToggle.hidden = !isCompare;
        els.shareCompare.hidden = !isCompare;
        els.clearCompare.hidden = !isCompare || state.compareIds.length <= 1;
    }

    function renderSpeciesList() {
        const query = state.speciesSearch;
        const filtered = species.filter((item) => {
            if (!query) return true;
            return [
                item.name, item.age, item.brain, item.era, item.location,
                ...(item.characteristics || []),
                ...(item.significance || []),
            ].join(" ").toLowerCase().includes(query);
        });

        els.speciesList.replaceChildren();
        let currentEra = "";
        filtered.forEach((item) => {
            if (item.era !== currentEra) {
                currentEra = item.era;
                els.speciesList.append(createEl("div", "era-group", currentEra));
            }

            const button = createEl("button", "species-button");
            button.type = "button";
            button.dataset.id = item.id;
            button.classList.toggle("is-active", item.id === state.currentId);
            button.classList.toggle("is-compared", state.compareIds.includes(item.id));
            button.setAttribute("aria-label", `${item.name}, ${item.age}`);

            const label = createEl("span");
            label.append(
                createEl("span", "species-name", item.name),
                createEl("span", "species-age", `${item.age} · ${item.brain}`)
            );
            button.append(label);
            if (state.compareIds.includes(item.id)) {
                const badge = createEl("span", "compare-badge", "✓");
                badge.setAttribute("aria-label", "Selected for comparison");
                button.append(badge);
            }
            button.addEventListener("click", () => {
                if (state.mode === "compare") addToCompare(item.id);
                selectSpecies(item.id);
                openDrawer(false);
            });
            els.speciesList.append(button);
        });

        if (!filtered.length) {
            els.speciesList.append(emptyState("No species found", "Try a species name, time range, region, or brain volume."));
        }
    }

    function selectSpecies(id) {
        if (!getSpecies(id)) return;
        state.currentId = id;
        renderCurrentHeader();
        renderDetailPanel();
        renderSpeciesList();
        renderMode();
        loadCurrentModel();
        if (state.mode === "compare") renderCompare();
        showResetHint();
        updateUrlForCurrent();
    }

    function showResetHint() {
        if (!els.viewerResetHint) return;
        els.viewerResetHint.classList.remove("is-visible");
        void els.viewerResetHint.offsetWidth;
        els.viewerResetHint.classList.add("is-visible");
    }

    function loadCurrentModel() {
        const item = getCurrentSpecies();
        if (!item || !els.singleViewer) return;
        bindLoadingState(els.singleViewer, els.viewerStage);
        setViewerAttrs(els.singleViewer, item, "fit");
        els.singleViewer.alt = `${item.name} skull model`;
    }

    function bindLoadingState(viewer, target) {
        const token = `${Date.now()}-${Math.random()}`;
        viewer.dataset.loadingToken = token;
        target.classList.add("is-loading");

        const clear = () => {
            if (viewer.dataset.loadingToken === token) {
                target.classList.remove("is-loading");
            }
        };

        viewer.addEventListener("load", clear, { once: true });
        viewer.addEventListener("error", clear, { once: true });
    }

    function setViewerAttrs(viewer, item, framing = "fit", options = {}) {
        viewer.setAttribute("src", item.file);
        viewer.setAttribute("orientation", modelOrientation);
        viewer.setAttribute("camera-target", defaultCameraTarget);
        const isCompareViewer = viewer.dataset.compareViewer === "true" || viewer.closest(".compare-cell");
        viewer.setAttribute("shadow-intensity", isCompareViewer ? "0.78" : "0.9");
        viewer.setAttribute("shadow-softness", "0.72");
        viewer.setAttribute("exposure", String(getCurrentFossilMaterial().exposure));
        viewer.setAttribute("environment-image", "neutral");
        viewer.setAttribute("disable-tap", "");
        if (framing === "scale") {
            viewer.setAttribute("camera-orbit", options.cameraOrbit || trueScaleCameraOrbit);
            viewer.setAttribute("min-camera-orbit", `auto ${minCameraPhi} 4m`);
            viewer.setAttribute("max-camera-orbit", options.maxCameraOrbit || `auto ${maxCameraPhi} ${maxTrueScaleCameraRadius}m`);
            viewer.setAttribute("field-of-view", "30deg");
        } else {
            viewer.setAttribute("camera-orbit", defaultCameraOrbit);
            viewer.setAttribute("min-camera-orbit", `auto ${minCameraPhi} 50%`);
            viewer.setAttribute("max-camera-orbit", `auto ${maxCameraPhi} ${maxFitCameraRadius}`);
            viewer.setAttribute("field-of-view", "auto");
        }
        viewer.dataset.resetCameraOrbit = viewer.getAttribute("camera-orbit") || "";
        viewer.dataset.resetCameraTarget = viewer.getAttribute("camera-target") || defaultCameraTarget;
        viewer.dataset.resetFieldOfView = viewer.getAttribute("field-of-view") || "auto";
        bindViewerCameraReset(viewer);
        const scale = state.trueScale ? item.scale : 1;
        viewer.setAttribute("scale", `${scale} ${scale} ${scale}`);
        setViewerSpin(viewer, state.spinning);
        queueFossilMaterial(viewer);
    }

    function bindViewerCameraReset(viewer) {
        if (viewer.dataset.cameraResetBound) return;
        viewer.dataset.cameraResetBound = "true";
        const resetTarget = viewer.closest(".compare-cell") || viewer.closest(".single-view") || viewer;
        let lastPointerDownTime = -Infinity;
        let lastClickTime = -Infinity;
        let lastResetTime = -Infinity;
        let suppressUntil = 0;
        const doubleClickDelay = 360;
        const suppressionWindow = 520;
        const suppressNativeGesture = (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
        };
        const isViewerEvent = (event) => event.composedPath?.().includes(viewer);
        const resetFromDoubleClick = () => {
            const now = performance.now();
            suppressUntil = Math.max(suppressUntil, now + suppressionWindow);
            if (now - lastResetTime <= 120) return;
            lastResetTime = now;
            resetViewerCamera(viewer);
        };
        resetTarget.addEventListener("pointerdown", (event) => {
            if (!isViewerEvent(event)) return;
            const now = performance.now();
            if (now - lastPointerDownTime <= doubleClickDelay) {
                suppressNativeGesture(event);
                resetFromDoubleClick();
                lastPointerDownTime = -Infinity;
                lastClickTime = -Infinity;
                return;
            }
            lastPointerDownTime = now;
        }, true);
        resetTarget.addEventListener("pointerup", (event) => {
            if (!isViewerEvent(event) || performance.now() > suppressUntil) return;
            suppressNativeGesture(event);
        }, true);
        resetTarget.addEventListener("click", (event) => {
            if (!isViewerEvent(event)) return;
            const now = performance.now();
            suppressNativeGesture(event);
            if (now - lastClickTime <= doubleClickDelay) {
                resetFromDoubleClick();
                lastClickTime = -Infinity;
                return;
            }
            lastClickTime = now;
        }, true);
        resetTarget.addEventListener("dblclick", (event) => {
            if (!isViewerEvent(event)) return;
            suppressNativeGesture(event);
            resetFromDoubleClick();
            lastPointerDownTime = -Infinity;
            lastClickTime = -Infinity;
        }, true);
    }

    function resetViewerCamera(viewer) {
        const cameraOrbit = viewer.dataset.resetCameraOrbit || defaultCameraOrbit;
        const cameraTarget = viewer.dataset.resetCameraTarget || defaultCameraTarget;
        const fieldOfView = viewer.dataset.resetFieldOfView || "auto";
        viewer.setAttribute("camera-orbit", cameraOrbit);
        viewer.setAttribute("camera-target", cameraTarget);
        viewer.setAttribute("field-of-view", fieldOfView);
        if (typeof viewer.jumpCameraToGoal === "function") viewer.jumpCameraToGoal();
        if (viewer.dataset.compareViewer === "true") {
            resetCompareCameraSync();
        }
    }

    function setViewerSpin(viewer, spinning) {
        if (!viewer) return;
        viewer.autoRotate = spinning;
        if (spinning) {
            viewer.setAttribute("auto-rotate", "");
            viewer.setAttribute("auto-rotate-delay", spinDelay);
            viewer.setAttribute("rotation-per-second", spinSpeed);
        } else {
            viewer.removeAttribute("auto-rotate");
            viewer.removeAttribute("auto-rotate-delay");
            viewer.removeAttribute("rotation-per-second");
        }
    }

    function queueFossilMaterial(viewer) {
        if (viewer.dataset.fossilMaterialBound) return;
        viewer.dataset.fossilMaterialBound = "true";
        viewer.addEventListener("load", () => applyFossilMaterial(viewer));
    }

    async function applyFossilMaterial(viewer) {
        const materials = viewer.model?.materials;
        if (!materials?.length) return;

        let colorTexture = null;
        let normalTexture = null;
        let occlusionTexture = null;
        try {
            [colorTexture, normalTexture, occlusionTexture] = await Promise.all([
                viewer.createTexture(getFossilTexture("color")),
                viewer.createTexture(getFossilTexture("normal")),
                viewer.createTexture(getFossilTexture("occlusion")),
            ]);
        } catch {
            colorTexture = null;
            normalTexture = null;
            occlusionTexture = null;
        }

        materials.forEach((material) => {
            const pbr = material.pbrMetallicRoughness;
            pbr?.setMetallicFactor?.(0);
            if (colorTexture) pbr?.baseColorTexture?.setTexture?.(colorTexture);
            if (normalTexture) material.normalTexture?.setTexture?.(normalTexture);
            if (occlusionTexture) material.occlusionTexture?.setTexture?.(occlusionTexture);
            material.setEmissiveFactor?.([0, 0, 0]);
        });
        applyFossilMaterialTheme(viewer, { animate: false });
    }

    function getCurrentFossilMaterial() {
        return fossilMaterialByTheme[document.documentElement.dataset.theme] || fossilMaterialByTheme.light;
    }

    function getModelViewers() {
        return [els.singleViewer, ...els.compareView.querySelectorAll("model-viewer")].filter(Boolean);
    }

    function syncFossilMaterialTheme({ animate = false } = {}) {
        getModelViewers().forEach((viewer) => applyFossilMaterialTheme(viewer, { animate }));
    }

    function applyFossilMaterialTheme(viewer, { animate = false } = {}) {
        const settings = getCurrentFossilMaterial();
        if (!viewer) return;
        const startExposure = Number(viewer.getAttribute("exposure")) || settings.exposure;
        if (!animate) {
            viewer.setAttribute("exposure", String(settings.exposure));
        }

        const materials = viewer.model?.materials || [];
        const materialStates = materials.map((material) => {
            const pbr = material.pbrMetallicRoughness;
            return {
                material,
                pbr,
                startColor: fossilMaterialState.get(material) || settings.baseColor,
            };
        }).filter((entry) => entry.pbr);

        if (!animate) {
            materialStates.forEach(({ pbr }) => {
                pbr.setBaseColorFactor?.(settings.baseColor);
                pbr.setRoughnessFactor?.(settings.roughness);
            });
            materialStates.forEach(({ material }) => {
                fossilMaterialState.set(material, settings.baseColor);
            });
            return;
        }

        const token = `${Date.now()}-${Math.random()}`;
        viewer.dataset.materialThemeToken = token;
        const startTime = performance.now();
        const step = (time) => {
            if (viewer.dataset.materialThemeToken !== token) return;
            const progress = clamp((time - startTime) / themeTransitionMs, 0, 1);
            const eased = 1 - ((1 - progress) ** 3);
            const exposure = startExposure + ((settings.exposure - startExposure) * eased);
            viewer.setAttribute("exposure", exposure.toFixed(3));
            materialStates.forEach(({ pbr, startColor }) => {
                pbr.setBaseColorFactor?.(settings.baseColor.map((value, index) => (
                    startColor[index] + ((value - startColor[index]) * eased)
                )));
                pbr.setRoughnessFactor?.(settings.roughness);
            });
            if (progress < 1) {
                requestAnimationFrame(step);
                return;
            }
            viewer.setAttribute("exposure", String(settings.exposure));
            materialStates.forEach(({ material }) => {
                fossilMaterialState.set(material, settings.baseColor);
            });
        };
        requestAnimationFrame(step);
    }

    function getFossilTexture(kind) {
        if (fossilTextureCache[kind]) return fossilTextureCache[kind];

        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        let seed = kind === "color" ? 78125 : kind === "normal" ? 43109 : 19237;
        const random = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };

        if (kind === "normal") {
            const data = ctx.createImageData(size, size);
            for (let y = 0; y < size; y += 1) {
                for (let x = 0; x < size; x += 1) {
                    const index = (y * size + x) * 4;
                    const wave = Math.sin(x * 0.12) * 5 + Math.cos(y * 0.1) * 5;
                    const grain = (random() - 0.5) * 20;
                    data.data[index] = clamp(128 + wave + grain, 102, 154);
                    data.data[index + 1] = clamp(128 - wave + grain * 0.6, 104, 152);
                    data.data[index + 2] = 236;
                    data.data[index + 3] = 255;
                }
            }
            ctx.putImageData(data, 0, 0);
        } else {
            const image = ctx.createImageData(size, size);
            for (let y = 0; y < size; y += 1) {
                for (let x = 0; x < size; x += 1) {
                    const index = (y * size + x) * 4;
                    const pore = Math.sin(x * 0.22 + y * 0.04) + Math.cos(y * 0.19);
                    const speckle = random();
                    const darkSpot = speckle > 0.984 ? -58 : speckle > 0.94 ? -18 : 0;
                    const lightFleck = speckle < 0.026 ? 30 : 0;
                    const base = kind === "occlusion" ? 226 : 218;
                    const value = clamp(base + pore * 6 + darkSpot * 0.72 + lightFleck * 0.72, 92, 246);
                    image.data[index] = kind === "occlusion" ? value : clamp(value + 4, 88, 242);
                    image.data[index + 1] = kind === "occlusion" ? value : clamp(value + 1, 84, 238);
                    image.data[index + 2] = kind === "occlusion" ? value : clamp(value - 13, 72, 218);
                    image.data[index + 3] = 255;
                }
            }
            ctx.putImageData(image, 0, 0);
        }

        ctx.globalAlpha = kind === "normal" ? 0.25 : 0.28;
        ctx.strokeStyle = kind === "normal" ? "rgb(142, 142, 236)" : "rgba(74, 64, 48, 0.46)";
        for (let i = 0; i < 22; i += 1) {
            const startX = random() * size;
            const startY = random() * size;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            for (let step = 0; step < 4; step += 1) {
                ctx.lineTo(startX + (random() - 0.5) * 82, startY + (random() - 0.5) * 56);
            }
            ctx.lineWidth = random() > 0.78 ? 1.1 : 0.45;
            ctx.stroke();
        }

        fossilTextureCache[kind] = canvas.toDataURL("image/png");
        return fossilTextureCache[kind];
    }

    function renderCurrentHeader() {
        const item = getCurrentSpecies();
        if (!item) return;
        els.currentEra.textContent = item.era || "";
        els.currentName.textContent = item.name;
        els.currentMeta.textContent = `${item.age} · ${item.brain}`;
    }

    function renderDetailPanel() {
        if (state.mode === "compare" && state.compareIds.length) {
            renderCompareDetailPanel();
            return;
        }

        const item = getCurrentSpecies();
        if (!item) {
            els.detailPanelContent.replaceChildren();
            return;
        }

        const title = createEl("h3", "", item.name);
        const muted = createEl("p", "detail-muted", `${item.era} · ${item.location || "Unknown site"}`);
        const grid = createEl("div", "detail-grid");
        [
            ["Age", item.age],
            ["Brain", item.brain],
            ["Found", item.yearFound ? String(item.yearFound) : "Unknown"],
            ["Discoverer", item.discoverer || "Unknown"],
        ].forEach(([label, value]) => grid.append(detailItem(label, value)));

        const traits = detailList("Traits", item.characteristics || []);
        const significance = detailList("Significance", item.significance || []);
        const catalogEntry = findCatalogEntryForSpecies(item);
        const actions = createEl("div", "detail-actions");
        if (catalogEntry) {
            const catalogButton = createCatalogEntryButton(catalogEntry);
            actions.append(catalogButton);
        } else if (item.doi) {
            actions.append(createExternalLink(`https://doi.org/${item.doi}`, "View publication"));
        }

        els.detailPanelContent.replaceChildren(title, muted, grid, traits, significance);
        if (actions.childElementCount) els.detailPanelContent.append(actions);
    }

    function renderCompareDetailPanel() {
        const items = state.compareIds.map(getSpecies).filter(Boolean);
        if (!items.length) {
            els.detailPanelContent.replaceChildren();
            return;
        }

        const title = createEl("h3", "", "Comparison");
        const muted = createEl("p", "detail-muted", `${items.length} ${items.length === 1 ? "skull" : "skulls"} selected`);
        const list = createEl("div", "compare-facts");
        items.forEach((item, index) => {
            const card = createEl("article", "compare-fact-card");
            const heading = createEl("h4");
            heading.append(
                createEl("span", "compare-index", String(index + 1)),
                createEl("span", "", item.name)
            );
            const grid = createEl("div", "compare-fact-grid");
            [
                ["Age", item.age],
                ["Brain", item.brain],
                ["Site", firstLocation(item.location)],
                ["Found", item.yearFound ? String(item.yearFound) : "Unknown"],
            ].forEach(([label, value]) => grid.append(detailItem(label, value)));
            card.append(heading, grid);
            list.append(card);
        });

        els.detailPanelContent.replaceChildren(title, muted, list);
    }

    function detailItem(label, value) {
        const item = createEl("div", "detail-item");
        item.append(createEl("span", "", label), createEl("strong", "", value));
        return item;
    }

    function detailList(title, items) {
        const section = createEl("section", "detail-section");
        section.append(createEl("h4", "", title));
        const list = createEl("ul");
        items.forEach((item) => list.append(createEl("li", "", addImperial(item))));
        section.append(list);
        return section;
    }

    function addToCompare(id) {
        if (!getSpecies(id) || state.compareIds.includes(id)) return;
        if (state.compareIds.length >= maxCompareSlots) {
            showToast(`Limit: ${maxCompareSlots} skulls.`);
            return;
        }
        state.compareIds.push(id);
    }

    function seedComparison() {
        const ids = [state.currentId, ...state.compareIds]
            .filter((id, index, list) => getSpecies(id) && list.indexOf(id) === index)
            .slice(0, maxCompareSlots);
        state.compareIds = ids;
    }

    function removeFromCompare(id) {
        state.compareIds = state.compareIds.filter((itemId) => itemId !== id);
        if (!state.compareIds.length) state.mode = "single";
        renderMode();
        renderSpeciesList();
        renderCompare();
        renderDetailPanel();
    }

    function renderCompare() {
        els.scaleToggle.classList.toggle("is-active", state.trueScale);
        els.scaleToggle.setAttribute("aria-pressed", String(state.trueScale));

        const selectedCount = state.compareIds.length;
        els.clearCompare.hidden = state.mode !== "compare" || selectedCount <= 1;
        els.clearCompare.disabled = selectedCount <= 1;
        const canAddMore = selectedCount < maxCompareSlots;
        const hasOpenSlot = state.mode === "compare" && canAddMore && (selectedCount < 2 || selectedCount % 2 === 1);
        const visibleSlots = state.compareIds.length + (hasOpenSlot ? 1 : 0);
        const scaleCamera = state.trueScale ? getCompareScaleCameraAttrs() : null;
        els.compareView.dataset.count = String(Math.max(1, visibleSlots));
        els.compareView.replaceChildren();
        state.compareIds.forEach((id) => {
            const item = getSpecies(id);
            if (!item) return;

            const cell = createEl("article", "compare-cell");
            const label = createEl("div", "cell-label");
            label.append(createEl("strong", "", item.name), createEl("span", "", `${item.age} · ${item.brain}`));
            const remove = createIconButton("icon-x", `Remove ${item.name}`);
            remove.classList.add("cell-remove");
            remove.addEventListener("click", () => removeFromCompare(id));
            const viewer = document.createElement("model-viewer");
            viewer.dataset.compareViewer = "true";
            viewer.setAttribute("camera-controls", "");
            viewer.setAttribute("interaction-prompt", "none");
            viewer.setAttribute("loading", "eager");
            viewer.setAttribute("reveal", "auto");
            viewer.alt = `${item.name} skull model`;
            bindLoadingState(viewer, cell);
            setViewerAttrs(viewer, item, state.trueScale ? "scale" : "fit", scaleCamera || {});
            bindCompareCameraSync(viewer);
            cell.append(label, remove, viewer);
            els.compareView.append(cell);
        });
        if (hasOpenSlot) els.compareView.append(comparePlaceholder());
    }

    function getCompareScaleCameraAttrs() {
        const sizeRatios = state.compareIds
            .map(getSpecies)
            .filter(Boolean)
            .map(getCranialSizeRatio);
        if (!sizeRatios.length) return { cameraOrbit: trueScaleCameraOrbit };
        const maxSizeRatio = Math.max(...sizeRatios);
        const radius = trueScaleCameraRadius * Math.max(0.12, maxSizeRatio) * trueScaleFitPadding;
        return {
            cameraOrbit: `90deg 90deg ${radius.toFixed(2)}m`,
            maxCameraOrbit: `auto ${maxCameraPhi} ${Math.max(maxTrueScaleCameraRadius, radius * 1.15).toFixed(2)}m`,
        };
    }

    function getBrainCc(item) {
        const matches = String(item?.brain || "").match(/\d+(?:\.\d+)?/g);
        return matches?.length ? Math.max(...matches.map(Number)) : 1400;
    }

    function getCranialSizeRatio(item) {
        return Math.cbrt(Math.max(1, getBrainCc(item)) / 1400);
    }

    function comparePlaceholder() {
        const slot = createEl("button", "compare-placeholder");
        slot.type = "button";
        slot.setAttribute("aria-label", "Select another skull to compare");
        slot.append(
            createEl("span", "compare-placeholder-mark", "+"),
            createEl("strong", "", "Select another skull"),
            createEl("span", "", "Choose from the skull browser.")
        );
        slot.addEventListener("click", () => {
            openDrawer(true);
            els.speciesSearch?.focus();
        });
        return slot;
    }

    function bindCompareCameraSync(viewer) {
        viewer.addEventListener("load", () => {
            captureCompareBaseline(viewer);
            if (compareCameraSync.camera && state.mode === "compare") {
                applyViewerCamera(viewer, compareCameraSync.camera, true);
            }
        }, { once: true });
        viewer.addEventListener("wheel", zoomCompareCameras, { capture: true, passive: false });
        viewer.addEventListener("camera-change", syncCompareCameraFromSource);
    }

    function zoomCompareCameras(event) {
        if (state.mode !== "compare") return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const sourceViewer = event.currentTarget;
        const camera = readViewerCamera(sourceViewer);
        if (!camera) return;

        const wheelDelta = normalizeWheelDelta(event);
        const zoomFactor = Math.exp(wheelDelta * compareWheelZoomRate);
        camera.radiusRatio = clamp(camera.radiusRatio * zoomFactor, 0.18, 6);
        camera.fieldOfViewRatio = clamp(camera.fieldOfViewRatio * zoomFactor, 0.35, 2.5);

        compareCameraSync.camera = camera;
        try {
            compareCameraSync.applying = true;
            els.compareView.querySelectorAll("model-viewer").forEach((viewer) => {
                applyViewerCamera(viewer, camera);
            });
        } finally {
            compareCameraSync.applying = false;
        }
    }

    function normalizeWheelDelta(event) {
        if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 18;
        if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight;
        return event.deltaY;
    }

    function syncCompareCameraFromSource(event) {
        if (state.mode !== "compare" || compareCameraSync.applying) return;
        if (event.detail?.source !== userCameraChangeSource) return;

        const sourceViewer = event.currentTarget;
        const camera = readViewerCamera(sourceViewer);
        if (!camera) return;

        compareCameraSync.camera = camera;
        try {
            compareCameraSync.applying = true;
            els.compareView.querySelectorAll("model-viewer").forEach((viewer) => {
                if (viewer === sourceViewer) return;
                applyViewerCamera(viewer, camera);
            });
        } finally {
            compareCameraSync.applying = false;
        }
    }

    function readViewerCamera(viewer) {
        if (
            typeof viewer.getCameraOrbit !== "function" ||
            typeof viewer.getCameraTarget !== "function" ||
            typeof viewer.getFieldOfView !== "function"
        ) {
            return null;
        }

        const baseline = getCompareBaseline(viewer);
        if (!baseline) return null;

        const orbit = viewer.getCameraOrbit();
        const target = viewer.getCameraTarget();
        const fieldOfView = viewer.getFieldOfView();

        return {
            theta: orbit.theta,
            phi: orbit.phi,
            radiusRatio: orbit.radius / baseline.radius,
            targetOffset: {
                x: (target.x - baseline.target.x) / baseline.radius,
                y: (target.y - baseline.target.y) / baseline.radius,
                z: (target.z - baseline.target.z) / baseline.radius,
            },
            fieldOfViewRatio: fieldOfView / baseline.fieldOfView,
        };
    }

    function applyViewerCamera(viewer, camera, jump = false) {
        const baseline = getCompareBaseline(viewer);
        if (!baseline) return;

        const radius = baseline.radius * camera.radiusRatio;
        const target = {
            x: baseline.target.x + camera.targetOffset.x * baseline.radius,
            y: baseline.target.y + camera.targetOffset.y * baseline.radius,
            z: baseline.target.z + camera.targetOffset.z * baseline.radius,
        };
        const fieldOfView = baseline.fieldOfView * camera.fieldOfViewRatio;

        viewer.setAttribute("camera-orbit", `${camera.theta}rad ${camera.phi}rad ${radius}m`);
        viewer.setAttribute("camera-target", `${target.x}m ${target.y}m ${target.z}m`);
        viewer.setAttribute("field-of-view", `${fieldOfView}deg`);
        if (jump && typeof viewer.jumpCameraToGoal === "function") viewer.jumpCameraToGoal();
    }

    function getCompareBaseline(viewer) {
        return compareCameraSync.baselines.get(viewer) || captureCompareBaseline(viewer);
    }

    function captureCompareBaseline(viewer) {
        if (
            typeof viewer.getCameraOrbit !== "function" ||
            typeof viewer.getCameraTarget !== "function" ||
            typeof viewer.getFieldOfView !== "function"
        ) {
            return null;
        }

        const orbit = viewer.getCameraOrbit();
        const target = viewer.getCameraTarget();
        const baseline = {
            radius: orbit.radius || 1,
            target: { x: target.x, y: target.y, z: target.z },
            fieldOfView: viewer.getFieldOfView() || 30,
        };
        compareCameraSync.baselines.set(viewer, baseline);
        return baseline;
    }

    function resetCompareCameraSync() {
        compareCameraSync.camera = null;
        compareCameraSync.baselines = new WeakMap();
    }

    function toggleSpin() {
        state.spinning = !state.spinning;
        els.toggleSpin.classList.toggle("is-active", state.spinning);
        els.toggleSpin.setAttribute("aria-pressed", String(state.spinning));
        els.toggleSpin.title = state.spinning ? "Stop rotation" : "Start rotation";
        els.toggleSpin.setAttribute("aria-label", state.spinning ? "Stop rotation" : "Start rotation");
        setViewerSpin(els.singleViewer, state.spinning);
        els.compareView.querySelectorAll("model-viewer").forEach((viewer) => {
            setViewerSpin(viewer, state.spinning);
        });
    }

    function shareComparison() {
        if (!state.compareIds.length) {
            showToast("Select a skull first.");
            return;
        }
        const url = `${location.origin}${location.pathname}?compare=${state.compareIds.join(",")}`;
        navigator.clipboard?.writeText(url)
            .then(() => showToast("Link copied."))
            .catch(() => showToast(url));
    }

    function clearComparison() {
        if (state.compareIds.length <= 1) {
            showToast("Nothing to clear.");
            return;
        }

        const firstId = state.compareIds[0];
        const firstItem = getSpecies(firstId);
        const removedCount = state.compareIds.length - 1;
        const plural = removedCount === 1 ? "skull" : "skulls";
        const message = `Clear comparison? This keeps ${firstItem?.name || "the first skull"} and removes ${removedCount} other ${plural}.`;
        if (!window.confirm(message)) return;

        state.compareIds = [firstId];
        state.currentId = firstId;
        resetCompareCameraSync();
        renderMode();
        renderSpeciesList();
        renderCompare();
        renderDetailPanel();
        showToast("Comparison cleared.");
    }

    function updateUrlForCurrent() {
        if (state.mode !== "single") return;
        const url = new URL(location.href);
        url.search = "";
        if (state.currentId !== defaultSpeciesId) url.searchParams.set("species", state.currentId);
        history.replaceState({}, "", url);
    }

    function populateFilters() {
        appendOptions(els.speciesFilter, "All species", unique(fossils.map((item) => item.species)));
        appendOptions(els.locationFilter, "All regions", unique(fossils.map((item) => firstLocation(item.location))));
    }

    function appendOptions(select, firstLabel, values) {
        select.replaceChildren(new Option(firstLabel, ""));
        values.forEach((value) => select.append(new Option(value, value)));
    }

    function renderTimelineFilters() {
        const eras = ["all", ...unique(fossils.map((item) => item.era))];
        els.eraFilters.replaceChildren();
        eras.forEach((era) => {
            const button = createEl("button", "era-filter", eraLabels[era] || toTitle(era));
            button.type = "button";
            button.classList.toggle("is-active", era === state.timelineEra);
            button.addEventListener("click", () => {
                state.timelineEra = era;
                renderTimelineFilters();
                renderTimeline();
            });
            els.eraFilters.append(button);
        });
    }

    function renderTimeline() {
        const items = fossils
            .filter((item) => state.timelineEra === "all" || item.era === state.timelineEra)
            .slice()
            .sort((a, b) => b.ageNumeric - a.ageNumeric);

        els.timelineScale.replaceChildren();
        els.timelinePoints.replaceChildren();

        const maxAge = Math.max(7, ...items.map((item) => item.ageNumeric || 0));
        const minAge = 0.025;
        const markers = [
            ["7 Ma", 7],
            ["3 Ma", 3],
            ["1 Ma", 1],
            ["500 ka", 0.5],
            ["100 ka", 0.1],
            ["30 ka", 0.03],
        ];

        markers.forEach(([label, age]) => {
            const marker = createEl("span", "scale-marker", label);
            marker.style.left = `${agePosition(age, maxAge, minAge)}%`;
            els.timelineScale.append(marker);
        });

        const rowY = [105, 165, 225, 285, 335];
        const used = [];
        items.forEach((item) => {
            const x = agePosition(item.ageNumeric, maxAge, minAge);
            let y = rowY[0];
            for (const candidate of rowY) {
                if (!used.some((point) => Math.abs(point.x - x) < 3.2 && point.y === candidate)) {
                    y = candidate;
                    break;
                }
            }
            used.push({ x, y });

            const button = createEl("button", "timeline-point");
            button.type = "button";
            button.style.left = `${x}%`;
            button.style.top = `${y}px`;
            button.title = `${item.species}\n${item.specimen}\n${item.age}`;
            button.setAttribute("aria-label", `${item.species}, ${item.specimen}, ${item.age}`);
            const image = document.createElement("img");
            image.src = thumbnailSrc(item.images?.[0], 160);
            image.alt = item.specimen;
            image.loading = "lazy";
            image.decoding = "async";
            image.addEventListener("error", () => image.remove());
            button.append(image);
            button.addEventListener("click", () => openModal(item.id));
            els.timelinePoints.append(button);
        });
    }

    function agePosition(ageMa, maxAge, minAge) {
        const safeAge = Math.max(Number(ageMa) || minAge, minAge);
        const logMax = Math.log10(maxAge);
        const logMin = Math.log10(minAge);
        const logAge = Math.log10(safeAge);
        return clamp(((logMax - logAge) / (logMax - logMin)) * 100, 2.5, 97.5);
    }

    function updateCatalogFilter(key, value) {
        state[key] = value;
        state.catalogPage = 1;
        renderCatalog();
    }

    function setCatalogView(view) {
        state.catalogView = view;
        els.gridView.classList.toggle("is-active", view === "grid");
        els.listView.classList.toggle("is-active", view === "list");
        renderCatalog();
    }

    function renderCatalog(append = false) {
        const filtered = getFilteredFossils();
        const perPage = 12;
        const visible = filtered.slice(0, state.catalogPage * perPage);

        els.catalogGrid.classList.toggle("is-list", state.catalogView === "list");
        if (!append) els.catalogGrid.replaceChildren();
        else els.catalogGrid.replaceChildren();

        visible.forEach((item) => els.catalogGrid.append(fossilCard(item)));
        els.resultCount.textContent = `${filtered.length} specimen${filtered.length === 1 ? "" : "s"}`;
        els.loadMore.style.display = visible.length < filtered.length ? "block" : "none";

        if (!visible.length) {
            els.catalogGrid.append(emptyState("No fossils found", "Loosen the search or clear one of the catalog filters."));
        }
    }

    function getFilteredFossils() {
        const search = state.catalogSearch;
        const filtered = fossils.filter((item) => {
            if (state.catalogSpecies && item.species !== state.catalogSpecies) return false;
            if (state.catalogLocation && firstLocation(item.location) !== state.catalogLocation) return false;
            if (!search) return true;
            return [
                item.species,
                item.specimen,
                item.location,
                item.description,
                item.significance,
                item.discoverer,
                item.citation,
            ].join(" ").toLowerCase().includes(search);
        });

        return filtered.sort((a, b) => {
            switch (state.catalogSort) {
                case "age-asc":
                    return a.ageNumeric - b.ageNumeric;
                case "name-asc":
                    return a.species.localeCompare(b.species);
                case "year-desc":
                    return (b.yearDiscovered || 0) - (a.yearDiscovered || 0);
                case "age-desc":
                default:
                    return b.ageNumeric - a.ageNumeric;
            }
        });
    }

    function fossilCard(item) {
        const card = createEl("button", "fossil-card");
        card.type = "button";
        card.setAttribute("aria-label", `Open ${item.species}, ${item.specimen}`);
        card.addEventListener("click", () => openModal(item.id));

        const imageWrap = createEl("div", "fossil-image");
        const image = document.createElement("img");
        image.src = thumbnailSrc(item.images?.[0], 520);
        image.srcset = `${thumbnailSrc(item.images?.[0], 160)} 160w, ${thumbnailSrc(item.images?.[0], 520)} 520w`;
        image.sizes = "(max-width: 719px) 112px, (max-width: 1019px) 50vw, 33vw";
        image.alt = item.specimen;
        image.loading = "lazy";
        image.decoding = "async";
        image.addEventListener("error", () => image.remove());
        imageWrap.append(image);

        const content = createEl("div", "fossil-content");
        content.append(
            createEl("div", "fossil-species", item.species),
            createEl("div", "fossil-specimen", item.specimen),
            createEl("div", "card-meta", `${item.age} · ${firstLocation(item.location)}`)
        );
        card.append(imageWrap, content);
        return card;
    }

    function openModal(id) {
        const item = fossils.find((fossil) => fossil.id === id);
        if (!item) return;
        state.activeModalId = id;
        state.activeModalImage = 0;
        renderModal(item);
        els.fossilModal.hidden = false;
        document.body.style.overflow = "hidden";
        setTimeout(() => els.modalClose.focus(), 0);
    }

    function renderModal(item) {
        const activeImage = item.images?.[state.activeModalImage] || item.images?.[0];
        const media = createEl("div", "modal-media");
        const image = document.createElement("img");
        image.className = "modal-main-image";
        image.src = thumbnailSrc(activeImage, 1200);
        image.alt = `${item.specimen}, ${item.species}`;
        image.decoding = "async";
        media.append(image);

        if ((item.images || []).length > 1) {
            const thumbs = createEl("div", "thumb-row");
            item.images.forEach((src, index) => {
                const thumb = createEl("button", "thumb-button");
                thumb.type = "button";
                thumb.classList.toggle("is-active", index === state.activeModalImage);
                thumb.setAttribute("aria-label", `Image ${index + 1}`);
                const thumbImg = document.createElement("img");
                thumbImg.src = thumbnailSrc(src, 160);
                thumbImg.alt = "";
                thumbImg.loading = "lazy";
                thumbImg.decoding = "async";
                thumb.append(thumbImg);
                thumb.addEventListener("click", () => {
                    state.activeModalImage = index;
                    renderModal(item);
                });
                thumbs.append(thumb);
            });
            media.append(thumbs);
        }

        const copy = createEl("div", "modal-copy");
        setModalTitleScale(copy, item.species);
        const tag = createEl("span", "era-tag", eraLabels[item.era] || item.eraLabel || toTitle(item.era));
        copy.append(
            tag,
            createEl("h2", "", item.species),
            createEl("h3", "", item.specimen),
            createEl("p", "", addImperial(`${item.location} · ${item.age}`))
        );

        const meta = createEl("div", "meta-grid");
        [
            ["Age", item.age],
            ["Location", item.location],
            ["Discovered", item.yearDiscovered ? String(item.yearDiscovered) : "Unknown"],
            ["Discoverer", item.discoverer || "Unknown"],
        ].forEach(([label, value]) => {
            const box = createEl("div", "meta-box");
            box.append(createEl("span", "", label), createEl("strong", "", value));
            meta.append(box);
        });

        copy.append(
            meta,
            modalSection("Description", addImperial(item.description)),
            modalSection("Significance", addImperial(item.significance)),
            citationBlock(item)
        );

        const detail = createEl("div", "modal-detail");
        detail.append(media, copy);
        els.modalContent.replaceChildren(detail);
    }

    function setModalTitleScale(container, title) {
        const words = String(title || "").split(/\s+/).filter(Boolean);
        const longestWord = words.reduce((longest, word) => Math.max(longest, word.length), 0);
        const totalLength = String(title || "").replace(/\s+/g, "").length;

        container.classList.toggle("has-long-title", longestWord >= 14 || totalLength >= 20);
        container.classList.toggle("has-very-long-title", longestWord >= 17 || totalLength >= 26);
    }

    function modalSection(title, text) {
        const section = createEl("section", "detail-section");
        section.append(createEl("h4", "", title), createEl("p", "", text || "Not documented."));
        return section;
    }

    function citationBlock(item) {
        const section = createEl("section", "detail-section");
        section.append(createEl("h4", "", "Citation"));
        const paragraph = createEl("p");
        const doi = extractDoi(item.citation);
        const href = item.primaryPaperUrl || (doi ? `https://doi.org/${doi}` : "");
        if (href) {
            const link = createExternalLink(href, item.citation);
            link.className = "citation-link";
            paragraph.append(link);
        } else {
            paragraph.textContent = item.citation || "Not documented.";
        }
        section.append(paragraph);
        return section;
    }

    function closeModal() {
        if (els.fossilModal.hidden) return;
        els.fossilModal.hidden = true;
        els.modalContent.replaceChildren();
        document.body.style.overflow = "";
        state.activeModalId = null;
    }

    function setupNavObserver() {
        const links = [...document.querySelectorAll("[data-nav]")];
        const sections = ["models", "timeline", "catalog"].map((id) => document.getElementById(id)).filter(Boolean);
        const setActive = () => {
            const headerOffset = (document.querySelector(".app-header")?.offsetHeight || 64) + 8;
            const active = sections.reduce((current, section) => (
                section.getBoundingClientRect().top <= headerOffset ? section : current
            ), sections[0]);
            links.forEach((link) => link.classList.toggle("is-active", link.dataset.nav === active?.id));
        };

        setActive();
        document.addEventListener("scroll", debounce(setActive, 50), { passive: true });
        window.addEventListener("hashchange", () => requestAnimationFrame(setActive));
        window.addEventListener("resize", debounce(setActive, 100));
    }

    function getSpecies(id) {
        const normalizedId = normalizeSpeciesId(id);
        return species.find((item) => item.id === normalizedId);
    }

    function normalizeSpeciesId(id) {
        const normalizedId = String(id || "").trim();
        return speciesAliases[normalizedId] || normalizedId;
    }

    function getCurrentSpecies() {
        return getSpecies(state.currentId);
    }

    function findCatalogEntryForSpecies(item) {
        if (!item) return null;
        if (item.doi) {
            const doi = normalizeDoi(item.doi);
            const doiMatch = fossils.find((fossil) => {
                const fossilDoi = normalizeDoi(extractDoi(fossil.citation) || fossil.primaryPaperUrl || "");
                return fossilDoi && fossilDoi === doi;
            });
            if (doiMatch) return doiMatch;
        }

        const speciesName = normalizeTaxon(expandSpeciesName(item.name));
        if (!speciesName) return null;

        return fossils.find((fossil) => normalizeTaxon(fossil.species) === speciesName)
            || fossils.find((fossil) => {
                const fossilName = normalizeTaxon(fossil.species);
                return fossilName.includes(speciesName) || speciesName.includes(fossilName);
            })
            || null;
    }

    function expandSpeciesName(name) {
        const trimmed = String(name || "").replace(/\s*\([^)]*\)/g, "").trim();
        return trimmed
            .replace(/^H\.\s+/i, "Homo ")
            .replace(/^A\.\s+/i, "Australopithecus ")
            .replace(/^P\.\s+/i, "Paranthropus ");
    }

    function normalizeTaxon(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/\([^)]*\)/g, "")
            .replace(/[^a-z]+/g, " ")
            .trim();
    }

    function normalizeDoi(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
            .replace(/^doi:\s*/, "")
            .trim();
    }

    function createEl(tag, className = "", text = "") {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== "") el.textContent = text;
        return el;
    }

    function emptyState(title, detail) {
        const wrap = createEl("div", "empty-state");
        wrap.append(createEl("strong", "", title), createEl("span", "", detail));
        return wrap;
    }

    function createIconButton(icon, label) {
        const button = createEl("button", "icon-button");
        button.type = "button";
        button.setAttribute("aria-label", label);
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", `#${icon}`);
        svg.append(use);
        button.append(svg);
        return button;
    }

    function createExternalLink(href, label) {
        const link = createEl("a", "publication-link", label);
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener";
        return link;
    }

    function createCatalogEntryButton(item) {
        const button = createEl("button", "catalog-entry-button");
        button.type = "button";
        button.setAttribute("aria-label", `View catalog entry for ${item.specimen}`);
        button.append(
            createEl("span", "catalog-entry-button-title", "View catalog entry"),
            createEl("span", "catalog-entry-button-meta", "Images, source data, and citation")
        );
        button.addEventListener("click", () => openModal(item.id));
        return button;
    }

    function thumbnailSrc(filename, size) {
        if (!filename) return "";
        return `images/fossils/thumbs/${filename.replace(/\.[^.]+$/, "")}-${size}.webp`;
    }

    function firstLocation(location = "") {
        return location.split(",")[0].trim() || "Unknown";
    }

    function unique(values) {
        return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
    }

    function toTitle(value = "") {
        return value.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function debounce(fn, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), wait);
        };
    }

    function extractDoi(text = "") {
        const match = text.match(/DOI:\s*([\d./\w-]+)/i);
        return match?.[1] || "";
    }

    function addImperial(text) {
        if (typeof text !== "string") return text || "";
        return text.replace(/(~?\d+(?:\.\d+)?)\s*m\b(?![a-z])/gi, (match, rawMeters, offset, source) => {
            const following = source.slice(offset + match.length, offset + match.length + 24).toLowerCase();
            if (following.includes("ft")) return match;
            const meters = Number(rawMeters.replace("~", ""));
            if (!Number.isFinite(meters)) return match;
            const totalInches = Math.round(meters * 39.3701);
            const feet = Math.floor(totalInches / 12);
            const inches = totalInches % 12;
            const approx = rawMeters.startsWith("~") ? "~" : "";
            const imperial = inches === 0 ? `${approx}${feet} ft` : `${approx}${feet} ft ${inches} in`;
            return `${rawMeters} m (${imperial})`;
        });
    }

    function showToast(message) {
        clearTimeout(showToast.timeout);
        els.toast.textContent = message;
        els.toast.classList.add("is-visible");
        showToast.timeout = setTimeout(() => els.toast.classList.remove("is-visible"), 2600);
    }
})();
