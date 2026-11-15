import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { attachRestFonts } from './app/rest-fonts';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));

// 나머지 한글(화면 글자 파일에 없는 글자)은 첫 화면 뒤에 붙임
attachRestFonts('fonts/sog-sans-rest.css');
