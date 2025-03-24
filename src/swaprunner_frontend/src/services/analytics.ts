import ReactGA from 'react-ga4';

class AnalyticsService {
  private initialized = false;

  init(measurementId: string) {
    if (this.initialized) return;
    
    ReactGA.initialize(measurementId);
    this.initialized = true;
  }

  pageView(path: string) {
    if (!this.initialized) return;
    ReactGA.send({ hitType: "pageview", page: path });
  }

  event(category: string, action: string, label?: string) {
    if (!this.initialized) return;
    ReactGA.event({
      category,
      action,
      label
    });
  }
}

export const analyticsService = new AnalyticsService(); 