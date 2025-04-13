// Order of Zodiac signs for navigation
const zodiacs = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpius",
  "sagittarius",
  "capricornus",
  "aquarius",
  "pisces",
];

const zodiacDateRangesStructured = {
  aries: {
    start: { month: "March", day: 21 },
    end: { month: "April", day: 19 },
  },
  taurus: {
    start: { month: "April", day: 20 },
    end: { month: "May", day: 20 },
  },
  gemini: {
    start: { month: "May", day: 21 },
    end: { month: "June", day: 20 },
  },
  cancer: {
    start: { month: "June", day: 21 },
    end: { month: "July", day: 22 },
  },
  leo: {
    start: { month: "July", day: 23 },
    end: { month: "August", day: 22 },
  },
  virgo: {
    start: { month: "August", day: 23 },
    end: { month: "September", day: 22 },
  },
  libra: {
    start: { month: "September", day: 23 },
    end: { month: "October", day: 22 },
  },
  scorpius: {
    start: { month: "October", day: 23 },
    end: { month: "November", day: 21 },
  },
  sagittarius: {
    start: { month: "November", day: 22 },
    end: { month: "December", day: 21 },
  },
  capricornus: {
    // Note: Crosses year boundary
    start: { month: "December", day: 22 },
    end: { month: "January", day: 19 },
  },
  aquarius: {
    start: { month: "January", day: 20 },
    end: { month: "February", day: 18 },
  },
  pisces: {
    start: { month: "February", day: 19 },
    end: { month: "March", day: 20 },
  },
};

let currentIndex = 0;
let animationTimeout = null; // To store the timeout ID

// Generalized function to animate stars and paths for a given constellation
function animateConstellation(zodiacId) {
  const constellationDiv = document.getElementById(zodiacId);
  if (!constellationDiv) {
    console.error("Could not find constellation div:", zodiacId);
    return;
  }

  const stars = constellationDiv.querySelectorAll(".star");
  const paths = constellationDiv.querySelectorAll(".connection-path");

  // --- Reset previous animation ---
  // Clear any ongoing timeout from the previous constellation's animation
  if (animationTimeout) {
    clearTimeout(animationTimeout);
    animationTimeout = null;
  }
  // Immediately remove 'visible' class from all elements of the *soon-to-be-animated* constellation
  stars.forEach((star) => star.classList.remove("visible"));
  paths.forEach((path) => path.classList.remove("visible"));
  // --- End Reset ---

  let step = 0;
  const delay = 200; // Delay in milliseconds (adjust as needed)

  function nextStep() {
    if (!constellationDiv || constellationDiv.style.display === "none") {
      // Stop animation if the constellation is hidden (e.g., user clicked quickly)
      return;
    }

    if (step < stars.length) {
      stars[step].classList.add("visible");

      // Add path connecting to the *previous* star, if it exists
      if (step > 0 && step - 1 < paths.length) {
        paths[step - 1].classList.add("visible");
      }

      step++;
      // Store the timeout ID
      animationTimeout = setTimeout(nextStep, delay);
    } else {
      animationTimeout = null; // Clear timeout ID when animation finishes
    }
  }

  // Use a small delay before starting the animation to ensure CSS reset applies
  setTimeout(nextStep, 50);
}

// Function to display the selected zodiac and trigger its animation
function showZodiac(index) {
  const currentZodiacId = zodiacs[currentIndex];
  const newZodiacId = zodiacs[index];
  document
    .getElementsByClassName("slide-visible")?.[0]
    ?.classList.remove("slide-visible");

  document
    .getElementById(newZodiacId + "-slide")
    .classList.add("slide-visible");

  const currentZodiacDiv = document.getElementById(currentZodiacId);
  const newZodiacDiv = document.getElementById(newZodiacId);

  if (currentZodiacDiv) {
    currentZodiacDiv.style.display = "none";
    // Optionally reset animation state immediately when hiding
    const currentStars = currentZodiacDiv.querySelectorAll(".star");
    const currentPaths = currentZodiacDiv.querySelectorAll(".connection-path");
    currentStars.forEach((s) => s.classList.remove("visible"));
    currentPaths.forEach((p) => p.classList.remove("visible"));
  } else {
    console.warn("Could not find current zodiac div:", currentZodiacId);
  }

  const zodiacName = document.getElementsByClassName("center-text")[0];
  zodiacName.innerHTML = newZodiacId.charAt(0).toUpperCase() + newZodiacId.substring(1);

  if (newZodiacDiv) {
    newZodiacDiv.style.display = "block";
    animateConstellation(newZodiacId); // Animate the newly shown constellation
  } else {
    console.error("Could not find new zodiac div:", newZodiacId);
  }

  currentIndex = index;
}

// Event listeners for arrow clicks
document.getElementById("left-arrow").addEventListener("click", () => {
  const newIndex = (currentIndex - 1 + zodiacs.length) % zodiacs.length;
  changeZodiac([zodiacs[newIndex]]);
});

document.getElementById("right-arrow").addEventListener("click", () => {
  const newIndex = (currentIndex + 1) % zodiacs.length;
  changeZodiac([zodiacs[newIndex]]);
});

goToSelectedZodiac = (zodiac_name) => {
  document.getElementsByClassName("page-1")[0].classList.remove("page-visible");
  document.getElementsByClassName("page-2")[0].classList.add("page-visible");

  const selectedIndex = zodiacs.findIndex((x) => x === zodiac_name.toLowerCase());
  setTimeout(() => {
    showZodiac(selectedIndex);
  }, 100);
};

goBackToHome = () => {
  document.getElementsByClassName("page-2")[0].classList.remove("page-visible");
  document.getElementsByClassName("page-1")[0].classList.add("page-visible");

  const zodiacName = document.getElementsByClassName("center-text")[0];
  zodiacName.innerHTML = "Zodiac";

  history.replaceState(null, '', window.location.pathname);
};

document.addEventListener("DOMContentLoaded", () => {
  Array.from(document.getElementsByClassName("zodiac-sector")).forEach(
    (element) => {
      element.addEventListener("click", (event) => {
        changeZodiac(element.getAttribute("data-zodiac"));
      });
    }
  );

  window.addEventListener("popstate", () => {
    checkLocationParam();
  }, false);

  checkLocationParam();
});

// document.getElementById("back-button").addEventListener("click", () => {
//   goBackToHome();
// });

changeZodiac = (newZodiacId) => {
  const newParams = new URLSearchParams(window.location.search);
  newParams.set("selectedZodiac", newZodiacId);

  const newUrl = `${window.location.pathname}?${newParams.toString()}`;
  history.pushState({}, "", newUrl);
  checkLocationParam();
}

checkLocationParam = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const selectedZodiac = urlParams.get('selectedZodiac') || "";
  if (selectedZodiac.length) {
    goToSelectedZodiac(selectedZodiac);
  } else {
    goBackToHome();
  }
};

document.getElementById("website-header").addEventListener("click", () => {
  goBackToHome();
});