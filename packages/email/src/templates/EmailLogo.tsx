import { Column } from "@react-email/column";
import { Row } from "@react-email/row";
import { Section } from "@react-email/section";
import * as React from "react";

import { BODY_FONT_FAMILY, BRAND_NAVY, BRAND_RED } from "./colors";

/**
 * Metricas logo lockup — a red rounded square with a white "M" next to the
 * "METRICAS" wordmark, matching the app's actual logo. Built with
 * table-based `@react-email` primitives (Section/Row/Column) rather than an
 * embedded image, since email clients render tables/inline-styles far more
 * consistently than images (which are also blocked by default in several
 * clients, hiding the logo entirely).
 */
export const EmailLogo = () => (
  <Section style={{ marginTop: "1.5rem", marginBottom: "2rem" }}>
    <Row>
      <Column style={{ width: "40px" }}>
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            backgroundColor: BRAND_RED,
            textAlign: "center" as const,
            lineHeight: "40px",
            color: "white",
            fontFamily: BODY_FONT_FAMILY,
            fontWeight: 800,
            fontSize: "20px",
          }}
        >
          M
        </div>
      </Column>
      <Column style={{ paddingLeft: "10px" }}>
        <span
          style={{
            fontFamily: BODY_FONT_FAMILY,
            fontSize: "20px",
            fontWeight: 800,
            letterSpacing: "1px",
            color: BRAND_NAVY,
          }}
        >
          METRICAS
        </span>
      </Column>
    </Row>
  </Section>
);

export default EmailLogo;
