(function () {
  "use strict";

  function initMobileMenu() {
    var toggle = document.querySelector("[data-gl-menu-toggle]");
    var nav = document.querySelector("[data-gl-mobile-nav]");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  function initHeroSliders() {
    document.querySelectorAll("[data-gl-hero]").forEach(function (hero) {
      var slides = Array.prototype.slice.call(hero.querySelectorAll("[data-gl-slide]"));
      var panels = Array.prototype.slice.call(hero.querySelectorAll("[data-gl-panel]"));
      var dots = Array.prototype.slice.call(hero.querySelectorAll("[data-gl-dot]"));
      var counter = hero.querySelector("[data-gl-counter]");
      var total = slides.length;
      if (total <= 1) return;

      var interval = parseInt(hero.getAttribute("data-interval"), 10) || 6000;
      var current = 0;
      var timer = null;

      function pad(n) {
        return String(n).padStart(2, "0");
      }

      function goTo(index) {
        current = (index + total) % total;

        slides.forEach(function (slide, i) {
          if (i === current) {
            slide.classList.remove("gl-anim");
            void slide.offsetWidth;
            slide.classList.add("is-active", "gl-anim");
          } else {
            slide.classList.remove("is-active", "gl-anim");
          }
        });

        panels.forEach(function (panel, i) {
          panel.classList.toggle("is-active", i === current);
        });

        dots.forEach(function (dot, i) {
          dot.classList.toggle("is-active", i === current);
        });

        if (counter) {
          counter.textContent = pad(current + 1) + " / " + pad(total);
        }
      }

      function next() {
        goTo(current + 1);
      }

      function prev() {
        goTo(current - 1);
      }

      function restart() {
        if (timer) window.clearInterval(timer);
        timer = window.setInterval(next, interval);
      }

      var nextBtn = hero.querySelector("[data-gl-next]");
      var prevBtn = hero.querySelector("[data-gl-prev]");
      if (nextBtn) nextBtn.addEventListener("click", function () { next(); restart(); });
      if (prevBtn) prevBtn.addEventListener("click", function () { prev(); restart(); });

      dots.forEach(function (dot, i) {
        dot.addEventListener("click", function () {
          goTo(i);
          restart();
        });
      });

      restart();
    });
  }

  function updateCartCount(count) {
    document.querySelectorAll(".gl-header__cart-count").forEach(function (el) {
      el.textContent = count;
    });
  }

  function initQuickAdd() {
    document.querySelectorAll("[data-gl-quick-add]").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var button = form.querySelector("button[type='submit']");
        var originalText = button ? button.textContent : "";
        if (button) {
          button.disabled = true;
          button.textContent = "Adding…";
        }

        fetch("/cart/add.js", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            items: [{ id: form.querySelector("input[name='id']").value, quantity: 1 }],
          }),
        })
          .then(function (res) {
            if (!res.ok) throw new Error("Add to cart failed");
            return fetch("/cart.js").then(function (r) { return r.json(); });
          })
          .then(function (cart) {
            updateCartCount(cart.item_count);
            if (button) button.textContent = "Added ✓";
          })
          .catch(function () {
            if (button) button.textContent = "Try again";
          })
          .finally(function () {
            window.setTimeout(function () {
              if (button) {
                button.disabled = false;
                button.textContent = originalText;
              }
            }, 1500);
          });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initMobileMenu();
    initHeroSliders();
    initQuickAdd();
  });
})();
