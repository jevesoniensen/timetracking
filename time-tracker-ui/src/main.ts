import 'zone.js';
import '@angular/compiler';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { AppComponent } from './components/ts/App';
import '../node_modules/@angular/material/prebuilt-themes/cyan-orange.css';
import './index.css';

bootstrapApplication(AppComponent, {
  providers: [provideAnimationsAsync()],
}).catch((err) => console.error(err));
