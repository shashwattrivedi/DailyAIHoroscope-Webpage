// Animation control for star overlay with horoscope content
document.addEventListener('DOMContentLoaded', function() {
  // Make sure the zodiac animations are properly positioned
  function adjustZodiacPosition() {
    const pageContainer = document.querySelector('.page-container');
    const starChart = document.querySelector('.star-chart');
    const zodiacContainer = document.getElementById('zodiac-container');
    const isMobile = window.innerWidth <= 768;
    
    if (starChart && pageContainer) {
      // For mobile, fill the entire viewport
      if (isMobile) {
        starChart.style.width = '100vw';
        starChart.style.height = '100vh';
        starChart.style.position = 'fixed';
        starChart.style.top = '0';
        starChart.style.left = '0';        // Set star transparency for mobile
        document.querySelectorAll('.background-star').forEach(star => {
          star.style.opacity = '0.1'; // Adjust background star transparency for mobile (0.0-1.0)
        });
        // Set main star transparency and color for mobile
        document.querySelectorAll('.star.visible').forEach(star => {
          star.style.opacity = '0.1';
          star.setAttribute('fill', '#fff');
          star.setAttribute('stroke', '#fff');
          star.style.setProperty('fill', '#fff', 'important');
          star.style.setProperty('stroke', '#fff', 'important');
        });
        // Set line (connection-path) transparency and color for mobile
        document.querySelectorAll('.connection-path.visible').forEach(line => {
          line.style.opacity = '0.1';
          line.setAttribute('stroke', '#fff');
          line.style.setProperty('stroke', '#fff', 'important');
        });
        // Set overall star chart transparency for mobile
        starChart.style.opacity = '0.1'; // Adjust overall star chart transparency (0.0-1.0)
      } else {
        // For desktop, fit within the container
        starChart.style.width = pageContainer.offsetWidth + 'px';
        starChart.style.height = pageContainer.offsetHeight + 'px';
        starChart.style.position = 'absolute';
        
        // Set star transparency for desktop
        document.querySelectorAll('.background-star').forEach(star => {
          star.style.opacity = '0.1'; // Adjust background star transparency for desktop (0.0-1.0)
        });
        // Set main star transparency and color for desktop
        document.querySelectorAll('.star.visible').forEach(star => {
          star.style.opacity = '0.1';
          star.setAttribute('fill', '#fff');
          star.setAttribute('stroke', '#fff');
          star.style.setProperty('fill', '#fff', 'important');
          star.style.setProperty('stroke', '#fff', 'important');
        });
        // Set line (connection-path) transparency and color for desktop
        document.querySelectorAll('.connection-path.visible').forEach(line => {
          line.style.opacity = '0.1';
          line.setAttribute('stroke', '#fff');
          line.style.setProperty('stroke', '#fff', 'important');
        });
        // Set overall star chart transparency for desktop
        starChart.style.opacity = '0.1'; // Adjust overall star chart transparency (0.0-1.0)
      }
    }
    
    // Center the stars in the viewport with adjustments for mobile
    if (zodiacContainer) {
      zodiacContainer.style.width = '100%';
      zodiacContainer.style.height = '100%';
      
      // Scale the zodiac elements based on screen size
      const zodiacs = document.querySelectorAll('.zodiac svg');
      zodiacs.forEach(zodiac => {
        if (isMobile) {
          zodiac.style.maxWidth = '100vw';
          zodiac.style.maxHeight = '100vh';
        } else {
          zodiac.style.maxWidth = '2000px';
          zodiac.style.maxHeight = 'none';
        }
      });
    }
  }

  // Call initially and on resize
  adjustZodiacPosition();
  window.addEventListener('resize', adjustZodiacPosition);

  // Remove any existing star transparency control
  const existingControl = document.querySelector('#star-transparency-control');
  if (existingControl) {
    existingControl.remove();
  }

  // Add enhanced visual effects when showing horoscope slides
  function enhanceHoroscopeDisplay() {
    // Get the active zodiac
    const activeZodiacId = document.querySelector('.zodiac[style*="display: block"]')?.id;
    
    if (activeZodiacId) {
      // Add a subtle pulse animation to stars
      const stars = document.querySelectorAll(`#${activeZodiacId} .star.visible`);
      stars.forEach(star => {
        // Add a subtle pulse effect
        star.style.animation = 'pulse 3s infinite';
      });
      
      // Add enhanced glow to the paths
      const paths = document.querySelectorAll(`#${activeZodiacId} .connection-path.visible`);
      paths.forEach(path => {
        path.style.filter = 'drop-shadow(0px 0px 3px rgba(0, 0, 0, 0.8))';
      });
    }
  }

  // Watch for slide changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        const target = mutation.target;
        if (target.classList.contains('slide-visible')) {
          setTimeout(enhanceHoroscopeDisplay, 500);
        }
      }
    });
  });

  // Observe all slides for class changes
  document.querySelectorAll('.slide').forEach(slide => {
    observer.observe(slide, { attributes: true });
  });
  // Add pulsing style
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes pulse {
      0% { opacity: 0.1; }
      50% { opacity: 0.3; }
      100% { opacity: 0.1; }
    }
  `;
  document.head.appendChild(style);
    // Adjust text container size based on screen dimensions
  function adjustTextContainers() {
    const horoscopeTexts = document.querySelectorAll('.horoscopetoday');
    const horoscopeHeadings = document.querySelectorAll('.horoscopeHeading');
    const isMobile = window.innerWidth <= 768;
    const isSmallMobile = window.innerWidth <= 480;
    
    horoscopeTexts.forEach(text => {
      if (isSmallMobile) {
        // For very small screens
        text.style.maxHeight = '65vh';
        text.style.overflowY = 'auto';
        text.style.padding = '15px';
        text.style.fontSize = '3.2rem';
        text.style.backgroundColor = 'rgba(255, 255, 255, 0.98)';
      } else if (isMobile) {
        // For mobile screens
        text.style.maxHeight = '70vh';
        text.style.overflowY = 'auto';
        text.style.padding = '20px';
        text.style.fontSize = '4rem';
        text.style.backgroundColor = 'rgba(255, 255, 255, 0.97)';
      } else {
        // For desktop
        text.style.maxHeight = '75vh';
        text.style.overflowY = 'auto';
        text.style.padding = '40px';
        text.style.fontSize = '5.5rem';
        text.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
      }
      
      // Ensure text is always readable
      text.style.color = '#000';
      text.style.textShadow = '0 0 2px rgba(255, 255, 255, 0.5)';
    });
    
    horoscopeHeadings.forEach(heading => {
      if (isSmallMobile) {
        heading.style.fontSize = '2.5rem';
        heading.style.padding = '6px';
      } else if (isMobile) {
        heading.style.fontSize = '3rem';
        heading.style.padding = '8px';
      } else {
        heading.style.fontSize = '4rem';
        heading.style.padding = '10px';
      }
    });
  }
  
  // Improve scrolling for mobile
  function enhanceMobileScrolling() {
    const horoscopeBar = document.querySelector('.horoscope-bar');
    if (horoscopeBar) {
      // Add horizontal scrolling indicators for mobile
      if (window.innerWidth <= 768) {
        if (!document.querySelector('.scroll-indicator')) {
          const leftIndicator = document.createElement('div');
          leftIndicator.className = 'scroll-indicator scroll-left';
          leftIndicator.innerHTML = '&lt;';
          
          const rightIndicator = document.createElement('div');
          rightIndicator.className = 'scroll-indicator scroll-right';
          rightIndicator.innerHTML = '&gt;';
          
          horoscopeBar.parentNode.insertBefore(leftIndicator, horoscopeBar);
          horoscopeBar.parentNode.insertBefore(rightIndicator, horoscopeBar.nextSibling);
          
          // Add scroll functionality
          leftIndicator.addEventListener('click', () => {
            horoscopeBar.scrollBy({ left: -100, behavior: 'smooth' });
          });
          
          rightIndicator.addEventListener('click', () => {
            horoscopeBar.scrollBy({ left: 100, behavior: 'smooth' });
          });
          
          // Add styles
          const scrollStyle = document.createElement('style');
          scrollStyle.innerHTML = `
            .scroll-indicator {
              position: absolute;
              top: 50%;
              transform: translateY(-50%);
              background: rgba(255,255,255,0.8);
              width: 30px;
              height: 30px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              z-index: 10;
              box-shadow: 0 0 5px rgba(0,0,0,0.2);
              font-size: 18px;
            }
            .scroll-left {
              left: 5px;
            }
            .scroll-right {
              right: 5px;
            }
            @media (min-width: 769px) {
              .scroll-indicator {
                display: none;
              }
            }
          `;
          document.head.appendChild(scrollStyle);
        }
      }
    }
  }
    // Call our responsive functions
  adjustTextContainers();
  enhanceMobileScrolling();
  window.addEventListener('resize', () => {
    adjustTextContainers();
    enhanceMobileScrolling();
  });
  
  // // Inject forced CSS for stars and lines to guarantee color and opacity
  // const forcedStyle = document.createElement('style');
  // forcedStyle.innerHTML = `
  //   .star.visible, .connection-path.visible {
  //     fill: #fff !important;
  //     stroke: #fff !important;
  //     opacity: 0.1 !important;
  //   }
  // `;
  // document.head.appendChild(forcedStyle);
});
