/**
 * Copyright 2009 Google Inc.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import("email.sendEmail");
import("funhtml.*", "stringutils.*");
import("netutils");
import("execution");

import("etherpad.utils.*");
import("etherpad.log");
import("etherpad.globals.*");
import("etherpad.quotas");
import("etherpad.sessions.getSession");

jimport("java.lang.System.out.println");

//----------------------------------------------------------------

function render_product() {
  if (request.params.from) { response.redirect(request.path); }
  renderFramed("about/product_body.ejs");
}

function render_faq() {
  renderFramed("about/faq_body.ejs", {
    LI: LI,
    H2: H2,
    A: A,
    html: html
  });
}

function render_pne_faq() {
  renderFramed("about/pne-faq.ejs");
}

function render_company() {
  renderFramed("about/company_body.ejs");
}

function render_contact() {
  renderFramed("about/contact_body.ejs");
}

function render_privacy() {
  renderFramed("about/privacy_body.ejs");
}

function render_tos() {
  renderFramed("about/tos_body.ejs");
}

function render_testimonials() {
  renderFramed("about/testimonials.ejs");
}

function render_appjet() {
  response.redirect("/ep/blog/posts/etherpad-and-appjet");
//  renderFramed("about/appjet_body.ejs");
}

function render_forums() {
  renderFramed("about/forums_body.ejs");
}

function render_really_real_time() {
  renderFramed("about/simultaneously.ejs");
}
  
function render_simultaneously() {
  renderFramed("about/simultaneously.ejs");
}

