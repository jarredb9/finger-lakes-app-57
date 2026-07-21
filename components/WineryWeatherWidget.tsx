'use client';

import { useEffect, useState } from 'react';
import { fetchWineryWeather, WineryWeatherData } from '../lib/services/weatherService';

interface WineryWeatherWidgetProps {
  latitude: number;
  longitude: number;
  className?: string;
}

export function WineryWeatherWidget({ latitude, longitude, className = '' }: WineryWeatherWidgetProps) {
  const [weather, setWeather] = useState<WineryWeatherData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    fetchWineryWeather(latitude, longitude)
      .then((data) => {
        if (isMounted) {
          setWeather(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setWeather(null);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [latitude, longitude]);

  if (loading) {
    return (
      <div className={`animate-pulse flex items-center gap-2 text-xs text-muted-foreground ${className}`}>
        <div className="h-4 w-4 rounded-full bg-muted"></div>
        <div className="h-4 w-28 bg-muted rounded"></div>
      </div>
    );
  }

  if (!weather) {
    return null;
  }

  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium text-foreground/80 bg-muted/30 border border-border/40 rounded-full px-3 py-1 w-fit backdrop-blur-sm ${className}`}>
      <span>{weather.icon}</span>
      <span>{weather.temperature}°F</span>
      <span className="text-muted-foreground">•</span>
      <span>{weather.condition}</span>
    </div>
  );
}
